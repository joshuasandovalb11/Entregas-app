import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
  Platform,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Delivery, DeliveryEvent, DeliveryTracking, Location } from '../types';
import * as TaskManager from 'expo-task-manager';
import * as LocationService from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from '../config/env';
// @ts-ignore
import getDirections from 'react-native-google-maps-directions';

const { width, height } = Dimensions.get('window');

interface MapScreenProps {}

type DeliveryState = 'not_started' | 'in_progress' | 'paused' | 'completed';
type EventType = 'inicio' | 'fin' | 'pausa' | 'reanudacion' | 'problema';

const LOCATION_TASK_NAME = 'background-location-task';

/**
 * Guarda la ubicación en AsyncStorage para persistencia local
 */
const saveLocationToStorage = async (location: any) => {
  try {
    const locationData = {
      tracking_id: Date.now(),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date().toISOString(),
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
    };

    const existingLocations = await AsyncStorage.getItem('saved_locations');
    const locations = existingLocations ? JSON.parse(existingLocations) : [];
    locations.push(locationData);
    const recentLocations = locations.slice(-1000);
    await AsyncStorage.setItem('saved_locations', JSON.stringify(recentLocations));
  } catch (error) {
    console.error('Error al guardar ubicación localmente:', error);
  }
};

/**
 * Envía la ubicación a la API del servidor
 */
const sendLocationToAPI = async (location: any) => {
  try {
    const locationData = {
      tracking_id: Date.now(),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date().toISOString(),
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
    };

    // TODO: Implementar envío real a la API
    console.log('Ubicación enviada a API (simulado):', locationData);
  } catch (error) {
    console.error('Error al enviar ubicación a la API:', error);
  }
};

/**
 * Tarea en segundo plano para seguimiento de ubicación
 */
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Error en background location task:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const location = locations[0];
      try {
        await saveLocationToStorage(location);
        await sendLocationToAPI(location);
      } catch (error) {
        console.error('Error al guardar ubicación:', error);
      }
    }
  }
});

export default function MapScreen({}: MapScreenProps) {
  const router = useRouter();
  const { authState } = useAuth();

  // Estados principales
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('not_started');
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Location[]>([]);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);
  const [currentDelivery, setCurrentDelivery] = useState<Delivery | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [totalPausedDuration, setTotalPausedDuration] = useState(0);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [routeInfo, setRouteInfo] = useState<{
    distance: string;
    duration: string;
    estimatedArrival: string;
  } | null>(null);
  const [googleMapsOpened, setGoogleMapsOpened] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Datos de prueba
  const mockDelivery: Delivery = {
    delivery_id: 1,
    driver_id: authState.driver?.driver_id || 1,
    client_id: 1,
    start_time: new Date().toISOString(),
    start_latitud: 32.49465864330434,
    start_longitud: -116.93280604091417,
    end_latitud: 32.49465864330434,
    end_longitud: -116.93280604091417,
    client: {
      client_id: 1,
      name: 'Jose Sanchez',
      phone: 6641234567,
      gps_location: '32.5500,-117.0100',
    },
  };

  // Efecto inicial
  useEffect(() => {
    setCurrentDelivery(mockDelivery);
    initializeLocation();
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
      if (isLocationEnabled) {
        LocationService.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    };
  }, []);

  // Calcula información de ruta cuando hay ubicación
  useEffect(() => {
    if (currentLocation && currentDelivery) {
      calculateRouteInfo();
    }
  }, [currentLocation, currentDelivery]);

  // Actualiza el tiempo actual cada segundo si la entrega está en progreso
  useEffect(() => {
    let interval: number;
    
    if (deliveryState === 'in_progress') {
      interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 1000); // Actualizar cada segundo
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [deliveryState]);

  /**
   * Maneja cambios en el estado de la app (para detectar cuando regresa de Google Maps)
   */
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // La app volvió al primer plano
      if (googleMapsOpened && deliveryState === 'in_progress') {
        console.log('Regresó de Google Maps, continuando tracking...');
        // Aquí podrías mostrar un mensaje o actualizar el estado
      }
    }
    setAppState(nextAppState);
  };

  /**
   * Inicializa el servicio de ubicación
   */
  const initializeLocation = async () => {
    try {
      const { status } = await LocationService.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Se necesitan permisos de ubicación');
        return;
      }

      const location = await LocationService.getCurrentPositionAsync({
        accuracy: LocationService.Accuracy.High,
      });

      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
    }
  };

  /**
   * Calcula información básica de la ruta
   */
  const calculateRouteInfo = async () => {
    if (!currentLocation || !currentDelivery?.end_latitud || !currentDelivery?.end_longitud) return;

    try {
      const start = `${currentLocation.latitude},${currentLocation.longitude}`;
      const end = `${currentDelivery.end_latitud},${currentDelivery.end_longitud}`;
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${start}&destination=${end}&key=${Config.GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        // Calcular hora de llegada estimada
        const now = new Date();
        now.setSeconds(now.getSeconds() + leg.duration.value);
        const estimatedArrival = now.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
          estimatedArrival,
        });
      }
    } catch (error) {
      console.error('Error al calcular información de ruta:', error);
    }
  };

  /**
   * Abre Google Maps con direcciones
   */
  const openGoogleMapsNavigation = () => {
    if (!currentLocation || !currentDelivery?.end_latitud || !currentDelivery?.end_longitud) {
      Alert.alert('Error', 'No se pudo obtener la ubicación o destino');
      return;
    }

    const data = {
      source: {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      destination: {
        latitude: currentDelivery.end_latitud,
        longitude: currentDelivery.end_longitud,
      },
      params: [
        {
          key: 'travelmode',
          value: 'driving', // driving, walking, bicycling, transit
        },
        {
          key: 'dir_action',
          value: 'navigate', // navigate para navegación directa
        },
      ],
    };

    try {
      getDirections(data);
      console.log('Google Maps abierto exitosamente');
      setGoogleMapsOpened(true);
    } catch (error) {
      console.error('Error al abrir Google Maps:', error);
      Alert.alert(
        'Error',
        'No se pudo abrir Google Maps. Asegúrate de tener la aplicación instalada.'
      );
    }
  };

  /**
   * Inicia el seguimiento de ubicación en segundo plano
   */
  const startLocationTracking = async () => {
    try {
      const { status } = await LocationService.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos necesarios', 'Se requieren permisos de ubicación en segundo plano');
        return;
      }
      
      await LocationService.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: LocationService.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
        foregroundService: {
          notificationTitle: 'Entrega en progreso',
          notificationBody: 'Rastreando ubicación para la entrega',
        },
      });
      
      setIsLocationEnabled(true);
      startRealtimeLocationUpdates();
    } catch (error) {
      console.error('Error al iniciar tracking:', error);
    }
  };

  /**
   * Inicia el seguimiento en tiempo real
   */
  const startRealtimeLocationUpdates = async () => {
    try {
      await LocationService.watchPositionAsync(
        {
          accuracy: LocationService.Accuracy.BestForNavigation,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (location) => {
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          setCurrentLocation(newLocation);
          setRouteCoordinates(prev => [...prev, newLocation]);
          saveLocationTracking(newLocation);
        }
      );
    } catch (error) {
      console.error('Error en seguimiento en tiempo real:', error);
    }
  };

  /**
   * Detiene el seguimiento de ubicación
   */
  const stopLocationTracking = async () => {
    try {
      await LocationService.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      setIsLocationEnabled(false);
    } catch (error) {
      console.error('Error al detener tracking:', error);
    }
  };

  /**
   * Guarda un evento de entrega
   */
  const saveDeliveryEvent = async (eventType: EventType, notes?: string) => {
    if (!currentDelivery || !currentLocation) return;
    
    const event: DeliveryEvent = {
      event_id: Date.now(),
      delivery_id: currentDelivery.delivery_id,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      latitud: currentLocation.latitude,
      longitud: currentLocation.longitude,
      notes,
    };

    // TODO: Implementar envío real a la API
    console.log('Evento guardado (simulado):', event);
  };

  /**
   * Guarda el seguimiento de ubicación
   */
  const saveLocationTracking = async (location: Location) => {
    if (!currentDelivery) return;
    
    const tracking: DeliveryTracking = {
      tracking_id: Date.now(),
      delivery_id: currentDelivery.delivery_id,
      driver_id: authState.driver?.driver_id || 1,
      timestamp: new Date().toISOString(),
      latitud: location.latitude,
      longitud: location.longitude,
    };

    // TODO: Implementar envío real a la API
    console.log('Tracking guardado (simulado):', tracking);
  };

  /**
   * Inicia la entrega
   */
  const handleStartDelivery = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'No se pudo obtener la ubicación');
      return;
    }

    Alert.alert(
      'Iniciar Entrega',
      'Se abrirá Google Maps para navegación. El seguimiento continuará en segundo plano.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: async () => {
            setDeliveryState('in_progress');
            setStartTime(new Date());
            setRouteCoordinates([currentLocation]);
            
            await startLocationTracking();
            await saveDeliveryEvent('inicio');
            
            // Abrir Google Maps
            openGoogleMapsNavigation();
          },
        },
      ]
    );
  };

  /**
   * Pausa la entrega
   */
  const handlePauseDelivery = async () => {
    if (deliveryState !== 'in_progress') return;
    
    Alert.alert(
      'Pausar Entrega',
      '¿Deseas pausar la entrega? El seguimiento se detendrá.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pausar',
          onPress: async () => {
            setDeliveryState('paused');
            setPausedTime(new Date());
            setCurrentTime(Date.now()); // Actualizar tiempo actual
            await stopLocationTracking();
            await saveDeliveryEvent('pausa');
          },
        },
      ]
    );
  };

  /**
   * Reanuda la entrega
   */
  const handleResumeDelivery = async () => {
    if (deliveryState !== 'paused') return;
    
    Alert.alert(
      'Reanudar Entrega',
      'Se abrirá Google Maps nuevamente y continuará el seguimiento.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reanudar',
          onPress: async () => {
            setDeliveryState('in_progress');
            if (pausedTime) {
              setTotalPausedDuration(prev => prev + (Date.now() - pausedTime.getTime()));
              setPausedTime(null);
            }
            setCurrentTime(Date.now()); // Actualizar tiempo actual
            await startLocationTracking();
            await saveDeliveryEvent('reanudacion');
            
            // Abrir Google Maps nuevamente
            openGoogleMapsNavigation();
          },
        },
      ]
    );
  };

  /**
   * Finaliza la entrega
   */
  const handleCompleteDelivery = async () => {
    Alert.alert(
      'Finalizar Entrega',
      '¿Estás seguro de que deseas finalizar la entrega?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setDeliveryState('completed');
            await stopLocationTracking();
            await saveDeliveryEvent('fin');
            
            // TODO: Enviar datos completos a la API
            Alert.alert('Entrega finalizada', 'La entrega ha sido completada exitosamente');
            router.back();
          },
        },
      ]
    );
  };

  /**
   * Calcula el tiempo transcurrido
   */
  const getFormattedElapsedTime = () => {
    if (!startTime) return '00:00:00';
    
    const now = deliveryState === 'paused' && pausedTime ? pausedTime.getTime() : currentTime;
    const elapsed = now - startTime.getTime() - totalPausedDuration;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Maneja el evento de llamada telefónica
   */
  const handlePhonePress = (phoneNumber?: string | number) => {
    if (!phoneNumber) {
      Alert.alert('Error', 'Número no disponible');
      return;
    }
    
    const formattedNumber = `tel:${phoneNumber}`;
    Linking.canOpenURL(formattedNumber)
      .then((supported) => {
        if (!supported) {
          Alert.alert('Error', 'Tu dispositivo no soporta llamadas telefónicas.');
        } else {
          return Linking.openURL(formattedNumber);
        }
      })
      .catch((err) => console.error('Error al abrir el teléfono:', err));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Entrega</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Información de la entrega */}
      <View style={styles.deliveryCard}>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>{currentDelivery?.client?.name || 'Cliente'}</Text>
          <TouchableOpacity onPress={() => handlePhonePress(currentDelivery?.client?.phone)}>
            <Text style={styles.clientPhone}>
              {currentDelivery?.client?.phone || 'N/A'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Estado de la entrega */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {deliveryState === 'in_progress' && (
            <Text style={styles.elapsedTime}>{getFormattedElapsedTime()}</Text>
          )}
        </View>

        {/* Información de la ruta */}
        {routeInfo && (
          <View style={styles.routeInfo}>
            <View style={styles.routeInfoRow}>
              <Ionicons name="location" size={16} color="#666" />
              <Text style={styles.routeInfoText}>Distancia: {routeInfo.distance}</Text>
            </View>
            <View style={styles.routeInfoRow}>
              <Ionicons name="time" size={16} color="#666" />
              <Text style={styles.routeInfoText}>Tiempo: {routeInfo.duration}</Text>
            </View>
            <View style={styles.routeInfoRow}>
              <Ionicons name="alarm" size={16} color="#666" />
              <Text style={styles.routeInfoText}>Llegada estimada: {routeInfo.estimatedArrival}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Información de navegación */}
      {deliveryState === 'in_progress' && (
        <View style={styles.navigationInfo}>
          <Ionicons name="navigate" size={24} color="#4CAF50" />
          <Text style={styles.navigationText}>
            Navegando con Google Maps
          </Text>
          <TouchableOpacity onPress={openGoogleMapsNavigation}>
            <Text style={styles.reopenText}>Reabrir Maps</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botones de acción */}
      <View style={styles.actionButtons}>
        {deliveryState === 'not_started' ? (
          <TouchableOpacity
            style={styles.startButton}
            onPress={handleStartDelivery}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.startButtonText}>Iniciar Entrega</Text>
          </TouchableOpacity>
        ) : deliveryState === 'completed' ? (
          <View style={styles.completedContainer}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.completedText}>Entrega Completada</Text>
          </View>
        ) : (
          <View style={styles.controlButtons}>
            <TouchableOpacity
              style={[styles.controlButton, styles.pauseButton]}
              onPress={deliveryState === 'in_progress' ? handlePauseDelivery : handleResumeDelivery}
            >
              <Ionicons
                name={deliveryState === 'in_progress' ? 'pause' : 'play'}
                size={20}
                color="#fff"
              />
              <Text style={styles.controlButtonText}>
                {deliveryState === 'in_progress' ? 'Pausar' : 'Reanudar'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.completeButton]}
              onPress={handleCompleteDelivery}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.controlButtonText}>Finalizar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );

  function getStatusColor() {
    switch (deliveryState) {
      case 'not_started': return '#FFA726';
      case 'in_progress': return '#4CAF50';
      case 'paused': return '#FF9800';
      case 'completed': return '#2196F3';
      default: return '#666';
    }
  }

  function getStatusText() {
    switch (deliveryState) {
      case 'not_started': return 'Pendiente';
      case 'in_progress': return 'En progreso';
      case 'paused': return 'Pausada';
      case 'completed': return 'Completada';
      default: return 'Desconocido';
    }
  }
}

// Estilos de la pantalla MapScreen
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  deliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clientInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  clientPhone: {
    fontSize: 14,
    color: '#4A90E2',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  elapsedTime: {
    fontSize: 14,
    color: '#666',
    marginLeft: 10,
  },
  routeInfo: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeInfoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  navigationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  navigationText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    flex: 1,
    marginLeft: 10,
  },
  reopenText: {
    fontSize: 14,
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginTop: 'auto',
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: '#4A90E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pauseButton: {
    backgroundColor: '#FF9800',
  },
  completeButton: {
    backgroundColor: '#e93a3aff',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  completedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 12,
  },
});