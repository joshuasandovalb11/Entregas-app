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

// Función para guardar ubicación en AsyncStorage
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

    // Obtener ubicaciones existentes
    const existingLocations = await AsyncStorage.getItem('saved_locations');
    const locations = existingLocations ? JSON.parse(existingLocations) : [];
    locations.push(locationData);
    const recentLocations = locations.slice(-1000);
    await AsyncStorage.setItem('saved_locations', JSON.stringify(recentLocations));
    console.log('Ubicación guardada en AsyncStorage:', {
      lat: locationData.latitude,
      lng: locationData.longitude,
      accuracy: locationData.accuracy,
      total_stored: recentLocations.length
    });
  } catch (error) {
    console.error('Error al guardar ubicación localmente:', error);
  }
};

// Función para enviar ubicación a la API
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

    // TODO: Implementar envío real a la API cuando esté disponible
    // const response = await fetch('YOUR_API_ENDPOINT/tracking', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': 'Bearer YOUR_TOKEN',
    //   },
    //   body: JSON.stringify(locationData),
    // });
    
    console.log('Ubicación enviada a API (simulado):', {
      lat: locationData.latitude,
      lng: locationData.longitude,
      timestamp: locationData.timestamp
    });
  } catch (error) {
    console.error('Error al enviar ubicación a la API:', error);
  }
};

// Interfaces para la información de la ruta
interface RouteInfo {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  overview_polyline: {
    points: string;
  };
}

// Definición de la tarea de ubicación en background
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Error en background location task:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const location = locations[0];
      console.log('Ubicación actualizada:', {
        latitud: location.coords.latitude,
        longitud: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
        source: 'background-task'
      });
      try {
        await saveLocationToStorage(location);
        await sendLocationToAPI(location);
        console.log('Background location guardada correctamente');
      } catch (error) {
        console.error('Error al guardar la ubicación en background:', error);
      }
    }
  }
  return Promise.resolve();
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

  // Estado para la ruta (sin pasos)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  // Estados para cámara tipo conductor
  const [cameraFollowMode, setCameraFollowMode] = useState<'none' | 'follow' | 'heading'>('none');
  const [userHeading, setUserHeading] = useState<number>(0);

  // Estados para el modal de problemas
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [problemDescription, setProblemDescription] = useState('');

  // Estados para el delivery actual
  const [currentDelivery, setCurrentDelivery] = useState<Delivery | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [totalPausedDuration, setTotalPausedDuration] = useState(0);

  const [subscription, setSubscription] = useState<{ remove: () => void } | null>(null);
  const [deviceOrientation, setDeviceOrientation] = useState<{
    azimuth: number;
    pitch: number;
    roll: number;
  } | null>(null);

  // Mock delivery data - Esto vendrá de la API
  const mockDelivery: Delivery = {
    delivery_id: 1,
    driver_id: authState.driver?.driver_id || 1,
    client_id: 1,
    start_time: new Date().toISOString(),
    start_latitud: 32.5149,
    start_longitud: -117.0382,
    end_latitud: 32.5500,
    end_longitud: -117.0100,
    client: {
      client_id: 1,
      name: 'Jose Sanchez',
      phone: 6641234567,
      gps_location: '32.5500,-117.0100',
    },
  };

  useEffect(() => {
    setCurrentDelivery(mockDelivery);
    initializeLocation();
    return () => {
      if (isLocationEnabled) {
        LocationService.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    };
  }, []);

  useEffect(() => {
    if (currentLocation && currentDelivery && deliveryState === 'not_started') {
      calculateRoute();
    }
  }, [currentLocation, currentDelivery]);

  useEffect(() => {
    // Solo activar sensores si el viaje está en progreso
    if (deliveryState !== 'in_progress') {
      if (subscription) subscription.remove();
      setSubscription(null);
      return;
    }

    let magnetometerData: { x: number; y: number; z: number } | null = null;
    let accelerometerData: { x: number; y: number; z: number } | null = null;

    const updateOrientation = () => {
      if (magnetometerData && accelerometerData) {
        const azimuth = Math.atan2(-magnetometerData.y, magnetometerData.x) * (180 / Math.PI);
        const pitch = Math.atan2(
          -accelerometerData.x,
          Math.sqrt(accelerometerData.y * accelerometerData.y + accelerometerData.z * accelerometerData.z)
        ) * (180 / Math.PI);
        const roll = Math.atan2(accelerometerData.y, accelerometerData.z) * (180 / Math.PI);

        setDeviceOrientation({
          azimuth: azimuth < 0 ? azimuth + 360 : azimuth,
          pitch,
          roll
        });

        // Solo actualizar la cámara si el cambio de azimuth es significativo (>5°)
        if (cameraFollowMode === 'heading' && currentLocation) {
          if (Math.abs(userHeading - azimuth) > 5) {
            setUserHeading(azimuth);
            updateDriverCamera(currentLocation, azimuth, null);
          }
        }
      }
    };

    const magnetometerSub = Magnetometer.addListener(data => {
      magnetometerData = data;
      updateOrientation();
    });

    const accelerometerSub = Accelerometer.addListener(data => {
      accelerometerData = data;
      updateOrientation();
    });

    // Configurar intervalos de actualización
    Magnetometer.setUpdateInterval(100);
    Accelerometer.setUpdateInterval(100);

    setSubscription({
      remove: () => {
        magnetometerSub.remove();
        accelerometerSub.remove();
      }
    });

    return () => {
      if (subscription) subscription.remove();
    };
  }, [cameraFollowMode, currentLocation, deliveryState]);

  useEffect(() => {
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [subscription]);

  const initializeLocation = async () => {
    try {
      const { status } = await LocationService.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Se necesitan permisos de ubicación para usar esta función');
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
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
    }
  };

  const calculateRoute = async () => {
    if (!currentLocation || !currentDelivery?.end_latitud || !currentDelivery?.end_longitud) return;

    try {
      const start = `${currentLocation.latitude},${currentLocation.longitude}`;
      const end = `${currentDelivery.end_latitud},${currentDelivery.end_longitud}`;
      
      // Usando Google Directions API con la clave configurada
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
        };
        setRouteInfo(routeInfo);

        const decodedPath = decodePolyline(route.overview_polyline.points);
        setPlannedRoute(decodedPath);

        if (mapRef.current) {
          const coordinates = [
            currentLocation,
            { latitude: currentDelivery.end_latitud, longitude: currentDelivery.end_longitud },
            ...decodedPath,
          ];
          mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        }

        console.log('Información de la ruta:', {
          distancia: leg.distance.text,
          duracion: leg.duration.text,
        });
      }
    } catch (error) {
      console.error('Error al calcular ruta:', error);
      const directRoute = [
        currentLocation,
        { latitude: currentDelivery.end_latitud, longitude: currentDelivery.end_longitud },
      ];
      setPlannedRoute(directRoute);
    }
  };

  // Función para decodificar polyline de Google Maps
  const decodePolyline = (encoded: string): Location[] => {
    const poly = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charAt(index++).charCodeAt(0) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      poly.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }
    return poly;
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await LocationService.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos de ubicación',
          'Se necesitan permisos de ubicación en background para el tracking. Nota: El tracking en background está limitado en Expo Go.',
          [{ text: 'Entendido' }]
        );
      }
      console.log('Iniciando location tracking...');
      try {
        await LocationService.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: LocationService.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 1,
          foregroundService: {
            notificationTitle: 'Navegación en curso',
            notificationBody: 'Siguiendo la ruta hacia tu destino',
          },
        });
        console.log('Background location tracking iniciado');
      } catch (bgError) {
        console.log('Background tracking falló, usando solo foreground:', bgError);
      }
      setIsLocationEnabled(true);
      startRealtimeLocationUpdates();
    } catch (error) {
      console.error('Error al iniciar tracking:', error);
    }
  };

  const updateDriverCamera = (location: Location, heading: number | null, speed: number | null) => {
    if (!mapRef.current || !location) return;
    const baseZoom = 18;
    const speedKmh = speed ? speed * 3.6 : 0;
    let zoomAdjustment = 0;
    if (speedKmh > 80) zoomAdjustment = 3;
    else if (speedKmh > 60) zoomAdjustment = 2;
    else if (speedKmh > 40) zoomAdjustment = 1;
    else if (speedKmh > 20) zoomAdjustment = 0.5;
    const finalZoom = Math.max(baseZoom - zoomAdjustment, 15);
    let basePitch = 60;
    if (deviceOrientation) {
      basePitch = Math.min(Math.max(45, basePitch - deviceOrientation.pitch * 0.5), 70);
    }
    mapRef.current.animateCamera({
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      zoom: finalZoom,
      heading: heading || userHeading || 0,
      pitch: basePitch,
    }, { duration: 300 });
  };

  const startRealtimeLocationUpdates = async () => {
    try {
      console.log('Iniciando tracking en tiempo real...');
      const locationSubscription = await LocationService.watchPositionAsync(
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
          const useDeviceHeading = deviceOrientation &&
            (location.coords.heading === null ||
              location.coords.heading === undefined ||
              location.coords.accuracy && location.coords.accuracy > 10);
          const currentHeading = useDeviceHeading ?
            deviceOrientation.azimuth :
            (location.coords.heading || userHeading || 0);
          setUserHeading(currentHeading);
          setCurrentLocation(newLocation);
          setRouteCoordinates(prev => [...prev, newLocation]);
          if (mapRef.current && deliveryState === 'in_progress') {
            updateDriverCamera(newLocation, currentHeading, location.coords.speed);
          }
          saveLocationTracking(newLocation);
        }
      );
      return () => {
        if (locationSubscription && locationSubscription.remove) {
          locationSubscription.remove();
        }
      };
    } catch (error) {
      console.error('Error en seguimiento en tiempo real:', error);
    }
  };

  const stopLocationTracking = async () => {
    try {
      console.log('Deteniendo location tracking...');
      await LocationService.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      setIsLocationEnabled(false);
      console.log('Location tracking detenido');
    } catch (error) {
      console.error('Error al detener tracking:', error);
    }
  };

  const saveDeliveryEvent = async (eventType: EventType, notes?: string) => {
    if (!currentDelivery || !currentLocation) return;
    const event: DeliveryEvent = {
      event_id: Date.now(), // En producción, esto sería generado por la API
      delivery_id: currentDelivery.delivery_id,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      latitud: currentLocation.latitude,
      longitud: currentLocation.longitude,
      notes,
    };
    try {
      // TODO: Enviar a la API
      // await fetch('YOUR_API_ENDPOINT/delivery-events', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${authState.token}`,
      //   },
      //   body: JSON.stringify(event),
      // });
      
      console.log('Evento guardado:', event);
    } catch (error) {
      console.error('Error al guardar evento:', error);
    }
  };

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
    try {
      // TODO: Enviar a la API
      // await fetch('YOUR_API_ENDPOINT/delivery-tracking', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${authState.token}`,
      //   },
      //   body: JSON.stringify(tracking),
      // });
      
      console.log('Tracking guardado (foreground):', {
        delivery_id: tracking.delivery_id,
        lat: tracking.latitud,
        lng: tracking.longitud,
        timestamp: tracking.timestamp
      });
    } catch (error) {
      console.error('Error al guardar tracking:', error);
    }
  };

  // Funciones para manejar el inicio, pausa, reanudación y finalización de la entrega
  const handleStartDelivery = async () => {
    if (!currentLocation) {
      Alert.alert('Error', 'No se pudo obtener la ubicación actual');
      return;
    }
    if (!routeInfo) {
      Alert.alert('Error', 'No se ha calculado la ruta. Espera un momento y vuelve a intentar.');
      return;
    }
    const motionGranted = await requestMotionPermissions();
    if (!motionGranted) {
      return;
    }
    console.log('Iniciando delivery...');
    setDeliveryState('in_progress');
    setStartTime(new Date());
    setRouteCoordinates([currentLocation]);
    setCameraFollowMode('heading');
    if (mapRef.current && currentLocation) {
      mapRef.current.animateCamera({
        center: {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        },
        zoom: 18,
        heading: userHeading || 0,
        pitch: 60,
      }, { duration: 1000 });
    }
    await startLocationTracking();
    await saveDeliveryEvent('inicio');
  };

  const toggleCameraMode = () => {
    if (cameraFollowMode === 'none') {
      setCameraFollowMode('follow');
    } else if (cameraFollowMode === 'follow') {
      setCameraFollowMode('heading');
    } else {
      setCameraFollowMode('none');
    }
  };

  const handlePauseDelivery = async () => {
    if (deliveryState !== 'in_progress') return;
    setDeliveryState('paused');
    setPausedTime(new Date());
    await stopLocationTracking();
    await saveDeliveryEvent('pausa');
    Alert.alert('Entrega pausada', 'El seguimiento se ha pausado');
  };

  const handleResumeDelivery = async () => {
    if (deliveryState !== 'paused') return;
    setDeliveryState('in_progress');
    if (pausedTime) {
      const pauseDuration = Date.now() - pausedTime.getTime();
      setTotalPausedDuration(prev => prev + pauseDuration);
      setPausedTime(null);
    }
    await startLocationTracking();
    await saveDeliveryEvent('reanudacion');
    Alert.alert('Entrega reanudada', 'El seguimiento se ha reanudado');
  };

  const handleReportProblem = async () => {
    if (!problemDescription.trim()) {
      Alert.alert('Error', 'Por favor describe el problema');
      return;
    }
    await saveDeliveryEvent('problema', problemDescription);
    Alert.alert('Problema reportado', 'El problema ha sido registrado correctamente');
    setShowProblemModal(false);
    setProblemDescription('');
  };

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
            const totalDuration = startTime ?
              Date.now() - startTime.getTime() - totalPausedDuration : 0;
            console.log('Duración total:', totalDuration);
            Alert.alert(
              'Entrega completada',
              'La entrega ha sido finalizada exitosamente',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          },
        },
      ]
    );
  };

  const requestMotionPermissions = async () => {
    try {
      if (Platform.OS === 'ios') {
        const { status } = await LocationService.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso requerido', 'Se necesitan permisos de ubicación para el seguimiento de orientación');
          return false;
        }
      }
      const isAvailable = await Magnetometer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Función no disponible', 'Tu dispositivo no tiene magnetómetro o no es compatible');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error al verificar sensores:', error);
      return false;
    }
  };

  // Función auxiliar para obtener la dirección cardinal
  const getCardinalDirection = (angle: number) => {
    const directions = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
    const index = Math.round(angle / 45) % 8;
    return directions[index];
  };

  const getButtonConfig = () => {
    switch (deliveryState) {
      case 'not_started':
        return {
          text: 'Iniciar Viaje',
          color: '#4CAF50',
          onPress: handleStartDelivery,
        };
      case 'in_progress':
        return {
          text: 'Pausar',
          color: '#FF9800',
          onPress: handlePauseDelivery,
        };
      case 'paused':
        return {
          text: 'Reanudar',
          color: '#4CAF50',
          onPress: handleResumeDelivery,
        };
      case 'completed':
        return {
          text: 'Completado',
          color: '#9E9E9E',
          onPress: () => {},
        };
      default:
        return {
          text: 'Iniciar Viaje',
          color: '#4CAF50',
          onPress: handleStartDelivery,
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <SafeAreaView style={styles.container}>
      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: currentLocation?.latitude || mockDelivery.start_latitud,
          longitude: currentLocation?.longitude || mockDelivery.start_longitud,
          latitudeDelta: 0.0009,
          longitudeDelta: 0.0009,
        }}
        showsUserLocation={true}
        followsUserLocation={cameraFollowMode !== 'none'}
        showsMyLocationButton={false}
        showsCompass={true}
        showsTraffic={deliveryState === 'in_progress'}
        mapType="standard"
        userLocationPriority="high"
        zoomEnabled={true}
        scrollEnabled={cameraFollowMode === 'none'}
        rotateEnabled={true}
        pitchEnabled={true}
        showsBuildings={true}
        loadingEnabled={true}
        loadingIndicatorColor="#4A90E2"
        moveOnMarkerPress={false}
        showsPointsOfInterest={false}
        userLocationFastestInterval={1000}
        userLocationUpdateInterval={1000}
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

        {/* SOLO UNA RUTA - La ruta activa */}
        {plannedRoute.length > 1 && (
          <Polyline
            coordinates={plannedRoute}
            strokeWidth={6}
            strokeColor="#4A90E2"
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
        )}

        {/* Ruta real trazada - Solo si está en progreso */}
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

      {/* Indicador de orientación del dispositivo */}
      {deviceOrientation && (
        <View style={styles.compassIndicator}>
          <Text style={styles.compassText}>
            {Math.round(deviceOrientation.azimuth)}° {getCardinalDirection(deviceOrientation.azimuth)}
          </Text>
        </View>
      )}

      {/* Botón de menú */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => router.back()}
      >
        <Ionicons name="menu" size={24} color="#333" />
      </TouchableOpacity>

      {deliveryState === 'in_progress' && (
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={toggleCameraMode}
        >
          <Ionicons
            name={
              cameraFollowMode === 'none' ? 'locate-outline' :
              cameraFollowMode === 'follow' ? 'locate' : 'navigate'
            }
            size={24}
            color={cameraFollowMode === 'none' ? '#666' : '#4A90E2'}
          />
          <Text style={styles.cameraButton}>
            {cameraFollowMode === 'none' ? 'Modo Mapa' :
            cameraFollowMode === 'follow' ? 'Seguimiento' : 'Navegación'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Panel inferior */}
      <View style={styles.bottomPanel}>
        {/* Información del cliente */}
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>
            Cliente: {currentDelivery?.client?.name}
          </Text>
          {/* Información de la ruta */}
          {routeInfo && (
            <View style={styles.routeInfo}>
              <View style={styles.routeInfoRow}>
                <Ionicons name="location" size={16} color="#666" />
                <Text style={styles.routeInfoText}>
                  Distancia: {routeInfo.distance.text}
                </Text>
              </View>
              <View style={styles.routeInfoRow}>
                <Ionicons name="time" size={16} color="#666" />
                <Text style={styles.routeInfoText}>
                  Duración: {routeInfo.duration.text}
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
            /* Botones para pausar/reanudar y finalizar */
            <React.Fragment>
              <TouchableOpacity
                style={[styles.pauseButton, deliveryState === 'completed' && styles.disabledButton]}
                onPress={buttonConfig.onPress}
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
                <Text style={styles.finishButtonText}>Finalizar Entrega</Text>
              </TouchableOpacity>
            </React.Fragment>
          )}
        </View>
        
        {/* Botón para reportar problemas */}
        {deliveryState === 'in_progress' && (
          <TouchableOpacity
            style={styles.problemButton}
            onPress={() => setShowProblemModal(true)}
          >
            <Ionicons name="alert-circle-outline" size={20} color="#fc4109ff" />
            <Text style={styles.problemButtonText}>Reportar Problema</Text>
          </TouchableOpacity>
        )}

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
      </View>
    </SafeAreaView>
  );
};

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
    top: 60,
    left: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  clientInfo: {
    marginBottom: 20,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pauseButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  finishButton: {
    backgroundColor: '#2196F3',
    borderRadius: 25,
    paddingVertical: 15,
    paddingHorizontal: 30,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  problemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  problemButtonText: {
    color: '#fc4109ff',
    fontSize: 14,
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
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  routeInfo: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  routeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  routeInfoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  cameraButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  compassIndicator: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  compassText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
