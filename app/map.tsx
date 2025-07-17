import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Magnetometer, Accelerometer } from 'expo-sensors';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Delivery, DeliveryEvent, DeliveryTracking, Location } from '../types';
import * as TaskManager from 'expo-task-manager';
import * as LocationService from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Config } from '../config/env';

const { width, height } = Dimensions.get('window');

interface MapScreenProps {}

type DeliveryState = 'not_started' | 'in_progress' | 'paused' | 'completed';
type EventType = 'inicio' | 'fin' | 'pausa' | 'reanudacion' | 'problema';

const LOCATION_TASK_NAME = 'background-location-task';

/**
 * Guarda la ubicación en AsyncStorage para persistencia local
 * @param location Objeto de ubicación a guardar
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
 * @param location Objeto de ubicación a enviar
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
    // Ejemplo de llamada API (descomentar cuando esté disponible):
    /*
    const response = await fetch(`${Config.API_URL}/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authState.token}`,
      },
      body: JSON.stringify(locationData),
    });
    if (!response.ok) throw new Error('Error en la respuesta del servidor');
    */
    
    console.log('Ubicación enviada a API (simulado):', locationData);
  } catch (error) {
    console.error('Error al enviar ubicación a la API:', error);
  }
};

// Interfaces para la información de la ruta
interface RouteStep {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  polyline: { points: string };
  html_instructions: string;
  maneuver?: string;
}

interface RouteInfo {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  overview_polyline: { points: string };
  steps: RouteStep[];
}

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
        await sendLocationToAPI(location); // Envía a la API
      } catch (error) {
        console.error('Error al guardar ubicación:', error);
      }
    }
  }
});

export default function MapScreen({}: MapScreenProps) {
  const router = useRouter();
  const { authState } = useAuth();
  const mapRef = useRef<MapView>(null);

  // Estados principales
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('not_started');
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Location[]>([]);
  const [plannedRoute, setPlannedRoute] = useState<Location[]>([]);
  const [isLocationEnabled, setIsLocationEnabled] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [detailedRoute, setDetailedRoute] = useState<Location[]>([]);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');
  const [currentDelivery, setCurrentDelivery] = useState<Delivery | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [totalPausedDuration, setTotalPausedDuration] = useState(0);

  // Datos de prueba - Reemplazar con datos reales de la API
  const mockDelivery: Delivery = {
    delivery_id: 1,
    driver_id: authState.driver?.driver_id || 1,
    client_id: 1,
    start_time: new Date().toISOString(),
    start_latitud: 32.49465864330434,
    start_longitud: 116.93280604091417,
    end_latitud: 32.49465864330434,
    end_longitud: -116.93280604091417,
    client: {
      client_id: 1,
      name: 'Jose Sanchez',
      phone: 6641234567,
      gps_location: '32.5500,-117.0100',
    },
  };

  // Efecto inicial: Carga datos de prueba y obtiene ubicación
  useEffect(() => {
    setCurrentDelivery(mockDelivery);
    initializeLocation();
    return () => {
      if (isLocationEnabled) {
        LocationService.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    };
  }, []);

  // Efecto secundario: Calcula ruta cuando hay ubicación y entrega
  useEffect(() => {
    if (currentLocation && currentDelivery && deliveryState === 'not_started') {
      calculateRoute();
    }
  }, [currentLocation, currentDelivery]);

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

      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
    }
  };

  /**
   * Calcula la ruta desde la ubicación actual al destino
   */
  const calculateRoute = async () => {
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
        
        const routeInfo: RouteInfo = {
          distance: leg.distance,
          duration: leg.duration,
          overview_polyline: route.overview_polyline,
          steps: leg.steps || [],
        };
        
        setRouteInfo(routeInfo);

        // Decodificar polilínea detallada
        const detailedCoordinates: Location[] = [];
        for (const step of leg.steps) {
          const stepCoordinates = decodePolyline(step.polyline.points);
          detailedCoordinates.push(...stepCoordinates);
        }
        
        setDetailedRoute(detailedCoordinates);
        const simplifiedRoute = decodePolyline(route.overview_polyline.points);
        setPlannedRoute(simplifiedRoute);

        // Ajustar vista del mapa
        if (mapRef.current) {
          mapRef.current.fitToCoordinates([...detailedCoordinates], {
            edgePadding: { top: 100, right: 50, bottom: 150, left: 50 },
            animated: true,
          });
        }
      }
    } catch (error) {
      console.error('Error al calcular ruta:', error);
      // Fallback a ruta directa
      const directRoute = [
        currentLocation,
        { latitude: currentDelivery.end_latitud, longitude: currentDelivery.end_longitud },
      ];
      setPlannedRoute(directRoute);
      setDetailedRoute(directRoute);
    }
  };

  /**
   * Decodifica una polilínea codificada de Google Maps
   * @param encoded Cadena codificada
   * @returns Array de coordenadas
   */
  const decodePolyline = (encoded: string): Location[] => {
    if (!encoded) return [];
    const poly: Location[] = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      poly.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return poly;
  };

  /**
   * Renderiza las líneas de la ruta en el mapa
   */
  const renderRoutePolylines = () => {
    const routeToDisplay = detailedRoute.length > 1 ? detailedRoute : plannedRoute;
    if (routeToDisplay.length <= 1) return null;
    
    return (
      <Polyline
        coordinates={routeToDisplay}
        strokeWidth={5}
        strokeColor="#4A90E2"
        lineCap="round"
        lineJoin="round"
        zIndex={1}
      />
    );
  };

  /**
   * Calcula la hora estimada de llegada
   */
  const calculateArrivalTime = () => {
    if (!routeInfo) return '--:--';
    const now = new Date();
    now.setSeconds(now.getSeconds() + routeInfo.duration.value);
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Inicia el seguimiento de ubicación en primer y segundo plano
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
        timeInterval: 2000,
        distanceInterval: 1,
        foregroundService: {
          notificationTitle: 'Navegación en curso',
          notificationBody: 'Siguiendo la ruta hacia el destino',
        },
      });
      
      setIsLocationEnabled(true);
      startRealtimeLocationUpdates();
    } catch (error) {
      console.error('Error al iniciar tracking:', error);
    }
  };

  /**
   * Actualiza la cámara del mapa para seguir al usuario
   */
  const updateDriverCamera = (location: Location, heading: number = 0) => {
    if (!mapRef.current || !location) return;
    
    mapRef.current.animateCamera({
      center: location,
      zoom: 18,
      heading,
      pitch: 0,
    }, { duration: 300 });
  };

  /**
   * Inicia el seguimiento en tiempo real (primer plano)
   */
  const startRealtimeLocationUpdates = async () => {
    try {
      await LocationService.watchPositionAsync(
        {
          accuracy: LocationService.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
        },
        (location) => {
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          setCurrentLocation(newLocation);
          setRouteCoordinates(prev => [...prev, newLocation]);
          
          if (deliveryState === 'in_progress') {
            updateDriverCamera(newLocation, location.coords.heading || 0);
          }
          
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
   * Guarda un evento de entrega (inicio, pausa, etc.)
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
    /*
    try {
      const response = await fetch(`${Config.API_URL}/delivery-events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`,
        },
        body: JSON.stringify(event),
      });
      if (!response.ok) throw new Error('Error en la respuesta');
    } catch (error) {
      console.error('Error al guardar evento:', error);
    }
    */
    
    console.log('Evento guardado (simulado):', event);
  };

  /**
   * Guarda el seguimiento de ubicación para la entrega
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
    /*
    try {
      const response = await fetch(`${Config.API_URL}/delivery-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`,
        },
        body: JSON.stringify(tracking),
      });
      if (!response.ok) throw new Error('Error en la respuesta');
    } catch (error) {
      console.error('Error al guardar tracking:', error);
    }
    */
    
    console.log('Tracking guardado (simulado):', tracking);
  };

  /**
   * Inicia la entrega
   */
  const handleStartDelivery = async () => {
    if (!currentLocation || !routeInfo) {
      Alert.alert('Error', !currentLocation ? 'No se pudo obtener la ubicación' : 'No hay ruta calculada');
      return;
    }

    setDeliveryState('in_progress');
    setStartTime(new Date());
    setRouteCoordinates([currentLocation]);
    
    updateDriverCamera(currentLocation);
    await startLocationTracking();
    await saveDeliveryEvent('inicio');
  };

  /**
   * Pausa la entrega
   */
  const handlePauseDelivery = async () => {
    if (deliveryState !== 'in_progress') return;
    setDeliveryState('paused');
    setPausedTime(new Date());
    await stopLocationTracking();
    await saveDeliveryEvent('pausa');
  };

  /**
   * Reanuda la entrega
   */
  const handleResumeDelivery = async () => {
    if (deliveryState !== 'paused') return;
    setDeliveryState('in_progress');
    if (pausedTime) {
      setTotalPausedDuration(prev => prev + (Date.now() - pausedTime.getTime()));
      setPausedTime(null);
    }
    await startLocationTracking();
    await saveDeliveryEvent('reanudacion');
  };

  /**
   * Reporta un problema durante la entrega
   */
  const handleReportProblem = async () => {
    if (!problemDescription.trim()) {
      Alert.alert('Error', 'Por favor describe el problema');
      return;
    }
    await saveDeliveryEvent('problema', problemDescription);
    setShowProblemModal(false);
    setProblemDescription('');
  };

  /**
   * Finaliza la entrega
   */
  const handleCompleteDelivery = async () => {
    Alert.alert(
      'Finalizar entrega',
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
            /*
            const totalDuration = startTime ? 
              Date.now() - startTime.getTime() - totalPausedDuration : 0;
            await sendDeliveryCompleteToAPI(totalDuration);
            */
            
            router.back();
          },
        },
      ]
    );
  };

  /**
   * Centra el mapa en la ubicación actual
   */
  const resetCameraToCurrentLocation = () => {
    if (mapRef.current && currentLocation) {
      mapRef.current.animateCamera({
        center: currentLocation,
        zoom: 18,
        heading: 0,
        pitch: 0,
      }, { duration: 300 });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Mapa principal */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: currentLocation?.latitude || mockDelivery.start_latitud,
          longitude: currentLocation?.longitude || mockDelivery.start_longitud,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
        showsUserLocation={true}
        showsTraffic={true}
        followsUserLocation={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {/* Marker de destino */}
        {mockDelivery.end_latitud && mockDelivery.end_longitud && (
          <Marker
            coordinate={{
              latitude: mockDelivery.end_latitud,
              longitude: mockDelivery.end_longitud,
            }}
            title={`Destino: ${mockDelivery.client?.name}`}
            description={`Teléfono: ${mockDelivery.client?.phone}`}
            pinColor="red"
          />
        )}

        {/* Ruta planificada */}
        {renderRoutePolylines()}

        {/* Ruta recorrida (solo durante entrega) */}
        {routeCoordinates.length > 1 && deliveryState === 'in_progress' && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor="#FF5722"
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        )}
      </MapView>

      {/* Botón de menú (esquina superior izquierda) */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      {/* Botón de centrar (arriba del panel inferior) */}
      {deliveryState === 'in_progress' && (
        <TouchableOpacity
          style={styles.centerButton}
          onPress={resetCameraToCurrentLocation}
        >
          <Ionicons name="locate" size={20} color="#4A90E2" />
          <Text style={styles.centerButtonText}>Centrar</Text>
        </TouchableOpacity>
      )}

      {/* Panel inferior compacto */}
      <View style={styles.bottomPanel}>
        {/* Información de la entrega */}
        <View style={styles.deliveryInfo}>
          <Text style={styles.clientName} numberOfLines={1}>
            {currentDelivery?.client?.name || 'Cliente'}
          </Text>
          
          {routeInfo && (
            <View style={styles.routeInfoContainer}>
              <View style={styles.routeInfoRow}>
                <Ionicons name="location" size={14} color="#666" />
                <Text style={styles.routeInfoText}>
                  {routeInfo.distance.text}
                </Text>
              </View>
              <View style={styles.routeInfoRow}>
                <Ionicons name="time" size={14} color="#666" />
                <Text style={styles.routeInfoText}>
                  {routeInfo.duration.text} • Llegada: {calculateArrivalTime()}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Botones de acción */}
        <View style={styles.actionButtons}>
          {deliveryState === 'not_started' ? (
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartDelivery}
            >
              <Text style={styles.startButtonText}>Iniciar Viaje</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, deliveryState === 'completed' && styles.disabledButton]}
                onPress={deliveryState === 'in_progress' ? handlePauseDelivery : handleResumeDelivery}
                disabled={deliveryState === 'completed'}
              >
                <Ionicons
                  name={deliveryState === 'in_progress' ? 'pause' : 'play'}
                  size={20}
                  color="#333"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.finishButton, deliveryState === 'completed' && styles.disabledButton]}
                onPress={handleCompleteDelivery}
                disabled={deliveryState === 'completed'}
              >
                <Text style={styles.finishButtonText}>Finalizar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        
        {/* Botón para reportar problemas (solo durante entrega) */}
        {deliveryState === 'in_progress' &&(
          <TouchableOpacity
            style={styles.problemButton}
            onPress={() => setShowProblemModal(true)}
          >
            <Ionicons name="alert-circle-outline" size={18} color="#fc4109" />
            <Text style={styles.problemButtonText}>Reportar Problema</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal para reportar problemas */}
      <Modal
        visible={showProblemModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProblemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reportar Problema</Text>
            <TextInput
              style={styles.problemInput}
              placeholder="Describe el problema..."
              value={problemDescription}
              onChangeText={setProblemDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowProblemModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleReportProblem}
              >
                <Text style={styles.submitButtonText}>Reportar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// Estilos optimizados para pantallas móviles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  map: {
    flex: 1,
  },
  menuButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 15,
    backgroundColor: 'white',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  centerButton: {
    position: 'absolute',
    bottom: height * 0.22, // Posición relativa al panel inferior
    right: 15,
    backgroundColor: 'white',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  centerButtonText: {
    marginLeft: 5,
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 15,
    // paddingBottom: Platform.OS === 'ios' ? 25 : 0,
    paddingBottom: Platform.OS === 'ios' ? 25 : 0 && Platform.OS === 'android' ? 0 : 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    maxHeight: height * 0.3,
  },
  deliveryInfo: {
    marginBottom: 12,
  },
  clientName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  routeInfoContainer: {
    marginTop: 8,
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeInfoText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 6,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 25,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  finishButton: {
    backgroundColor: '#2196F3',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 25,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  problemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  problemButtonText: {
    color: '#fc4109',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: width - 40,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  problemInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    fontSize: 15,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#F0F0F0',
  },
  submitButton: {
    backgroundColor: '#FF5722',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});