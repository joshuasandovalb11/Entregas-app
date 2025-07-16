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

// Función para guardar ubicación en AsyncStorage (global para TaskManager)
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
    
    // Agregar nueva ubicación
    locations.push(locationData);
    
    // Guardar de vuelta (mantener solo las últimas 1000 ubicaciones)
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

// Función para enviar ubicación a la API (global para TaskManager)
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
  steps: NavigationStep[];
  overview_polyline: {
    points: string;
  };
}

interface NavigationStep {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  html_instructions: string;
  maneuver?: string;
  start_location: {
    lat: number;
    lng: number;
  };
  end_location: {
    lat: number;
    lng: number;
  };
  polyline: {
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
      
      // Log de ubicación en background
      console.log('Ubicación actualizada:', {
        latitud: location.coords.latitude,
        longitud: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString(),
        source: 'background-task'
      });
      
      // Guardar ubicación en background
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
  
  // Estados para navegación detallada
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showNavigationPanel, setShowNavigationPanel] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Estados para cámara tipo conductor
  const [cameraFollowMode, setCameraFollowMode] = useState<'none' | 'follow' | 'heading'>('none');
  const [userHeading, setUserHeading] = useState<number>(0);
  const [navigationPanelVisible, setNavigationPanelVisible] = useState(false);
  const [isNavigationMinimized, setIsNavigationMinimized] = useState(false);
  
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

  // Mock delivery data - En producción esto vendrá de la API
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
    let magnetometerData: { x: number; y: number; z: number } | null = null;
    let accelerometerData: { x: number; y: number; z: number } | null = null;

    const updateOrientation = () => {
      if (magnetometerData && accelerometerData) {
        // Cálculo del azimuth (ángulo respecto al norte magnético)
        const azimuth = Math.atan2(-magnetometerData.y, magnetometerData.x) * (180 / Math.PI);
        
        // Cálculo del pitch (inclinación hacia adelante/atrás)
        const pitch = Math.atan2(
          -accelerometerData.x,
          Math.sqrt(accelerometerData.y * accelerometerData.y + accelerometerData.z * accelerometerData.z)
        ) * (180 / Math.PI);
        
        // Cálculo del roll (inclinación lateral)
        const roll = Math.atan2(accelerometerData.y, accelerometerData.z) * (180 / Math.PI);
        
        setDeviceOrientation({
          azimuth: azimuth < 0 ? azimuth + 360 : azimuth, // Asegurar valor entre 0-359
          pitch,
          roll
        });

        // Actualizar el heading del usuario si estamos en modo navegación
        if (cameraFollowMode === 'heading' && currentLocation) {
          setUserHeading(azimuth);
          updateDriverCamera(currentLocation, azimuth, null);
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
  }, [cameraFollowMode, currentLocation]);

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

      // Centrar mapa en la ubicación actual
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
        const leg = route.legs[0]; // Primera etapa del viaje
        
        // Extraer información completa de la ruta
        const routeInfo: RouteInfo = {
          distance: leg.distance,
          duration: leg.duration,
          steps: leg.steps,
          overview_polyline: route.overview_polyline,
        };
        
        setRouteInfo(routeInfo);
        
        const decodedPath = decodePolyline(route.overview_polyline.points);
        setPlannedRoute(decodedPath);
        
        // Ajustar el mapa para mostrar toda la ruta
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
          pasos: leg.steps.length,
        });
      }
    } catch (error) {
      console.error('Error al calcular ruta:', error);
      // Fallback: crear ruta directa
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
        // Continuamos con foreground tracking aunque no tengamos background
      }

      console.log('Iniciando location tracking...');
      
      try {
        await LocationService.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: LocationService.Accuracy.High,
          timeInterval: 2000, // Actualizar cada 2 segundos
          distanceInterval: 1, // O cada 1 metro (más sensible)
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
      
      // Iniciar seguimiento de ubicación en tiempo real
      startRealtimeLocationUpdates();
    } catch (error) {
      console.error('Error al iniciar tracking:', error);
    }
  };

  // Función para actualizar la cámara del conductor
  const updateDriverCamera = (location: Location, heading: number | null, speed: number | null) => {
    if (!mapRef.current || !location) return;
    
    // Ajustar zoom basado en velocidad
    const baseZoom = 18;
    const speedKmh = speed ? speed * 3.6 : 0; // Convertir m/s a km/h
    let zoomAdjustment = 0;
    
    if (speedKmh > 80) zoomAdjustment = 3;
    else if (speedKmh > 60) zoomAdjustment = 2;
    else if (speedKmh > 40) zoomAdjustment = 1;
    else if (speedKmh > 20) zoomAdjustment = 0.5;
    
    const finalZoom = Math.max(baseZoom - zoomAdjustment, 15);
    
    // Ajustar pitch basado en la orientación del dispositivo
    let basePitch = 60;
    if (deviceOrientation) {
      // Si el dispositivo está inclinado (por ejemplo, mirando hacia abajo), aumentar el pitch
      basePitch = Math.min(Math.max(45, basePitch - deviceOrientation.pitch * 0.5), 70);
    }
    
    // Configuración suavizada de la cámara
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

  // Función para verificar progreso de navegación
  const checkNavigationProgress = (currentLocation: Location) => {
    if (!routeInfo || currentStepIndex >= routeInfo.steps.length) return;
    
    const currentStep = routeInfo.steps[currentStepIndex];
    const nextStep = routeInfo.steps[currentStepIndex + 1];
    
    // Verificar si estamos cerca del final del paso actual
    const distanceToEnd = calculateDistance(currentLocation, currentStep.end_location);
    
    // Si estamos a menos de 50 metros del final del paso actual, avanzar
    if (distanceToEnd < 50 && nextStep) {
      setCurrentStepIndex(prev => Math.min(prev + 1, routeInfo.steps.length - 1));
      
      // Mostrar alerta con la siguiente instrucción (opcional)
      Alert.alert(
        'Próxima instrucción', 
        cleanHtmlInstructions(nextStep.html_instructions),
        [{ text: 'Entendido' }]
      );
    }
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
          
          // Usar el heading del dispositivo si está disponible y es más preciso
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
          
          // Actualizar cámara en modo conductor
          if (mapRef.current && deliveryState === 'in_progress') {
            updateDriverCamera(newLocation, currentHeading, location.coords.speed);
          }
          
          saveLocationTracking(newLocation);
          
          // Verificar progreso en la navegación
          if (routeInfo && isNavigating) {
            checkNavigationProgress(newLocation);
          }
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

    // Solicitar permisos de movimiento
    const motionGranted = await requestMotionPermissions();
    if (!motionGranted) {
      return;
    }

    console.log('Iniciando delivery...');
    
    setDeliveryState('in_progress');
    setStartTime(new Date());
    setRouteCoordinates([currentLocation]);
    
    // Configuración inicial del modo conductor
    setCameraFollowMode('heading');
    setIsNavigating(true);
    setNavigationPanelVisible(true);
    setIsNavigationMinimized(false);
    setCurrentStepIndex(0);
    
    // Ajustar la cámara inmediatamente
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
    
    // Calcular tiempo pausado
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
            setIsNavigating(false);
            setShowNavigationPanel(false);
            await stopLocationTracking();
            await saveDeliveryEvent('fin');
            
            // Calcular duración total
            const totalDuration = startTime ? 
              Date.now() - startTime.getTime() - totalPausedDuration : 0;
            
            // TODO: Actualizar delivery con duración real
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
      // En iOS 13+ necesitamos pedir permiso para el movimiento
      if (Platform.OS === 'ios') {
        const { status } = await LocationService.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso requerido', 'Se necesitan permisos de ubicación para el seguimiento de orientación');
          return false;
        }
      }
      
      // Verificar si el dispositivo tiene los sensores necesarios
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

  const getDirectionIcon = (maneuver?: string): string => {
    if (!maneuver) return 'arrow-up';
    
    const iconMap: { [key: string]: string } = {
      'turn-left': 'arrow-back',
      'turn-right': 'arrow-forward',
      'turn-slight-left': 'arrow-back',
      'turn-slight-right': 'arrow-forward',
      'turn-sharp-left': 'arrow-back',
      'turn-sharp-right': 'arrow-forward',
      'uturn-left': 'return-up-back',
      'uturn-right': 'return-up-forward',
      'straight': 'arrow-up',
      'ramp-left': 'arrow-back',
      'ramp-right': 'arrow-forward',
      'merge': 'git-merge',
      'fork-left': 'arrow-back',
      'fork-right': 'arrow-forward',
      'ferry': 'boat',
      'ferry-train': 'train',
      'roundabout-left': 'refresh',
      'roundabout-right': 'refresh',
    };
    
    return iconMap[maneuver] || 'arrow-up';
  };
  
  const nextStep = () => {
    if (routeInfo && currentStepIndex < routeInfo.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };
  
  const previousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };
  
  const getCurrentStep = (): NavigationStep | null => {
    if (!routeInfo || !routeInfo.steps || currentStepIndex >= routeInfo.steps.length) {
      return null;
    }
    return routeInfo.steps[currentStepIndex];
  };
  
  const cleanHtmlInstructions = (html: string): string => {
    return html
      .replace(/\<\/?b\>/g, '') // Quitar tags <b>
      .replace(/\<\/?div[^\>]*\>/g, '') // Quitar tags <div>
      .replace(/\<\/?wbr\/?\>/g, '') // Quitar tags <wbr>
      .replace(/\&amp;/g, '&') // Decodificar &amp;
      .replace(/\&lt;/g, '<') // Decodificar &lt;
      .replace(/\&gt;/g, '>') // Decodificar &gt;
      .replace(/\&quot;/g, '"') // Decodificar &quot;
      .replace(/\&#39;/g, "'"); // Decodificar &#39;
  };

  // Función para calcular la distancia entre dos puntos (en metros)
  const calculateDistance = (point1: Location, point2: { lat: number; lng: number }): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = point1.latitude * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.latitude) * Math.PI / 180;
    const Δλ = (point2.lng - point1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const distance = R * c; // Distancia en metros
    return distance;
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
          latitudeDelta: 0.005,  // Más cercano que antes
          longitudeDelta: 0.005, // Más cercano que antes
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
            /* Botón centrado para iniciar */
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

        {/* Panel de navegación */}
        {/* {isNavigating && navigationPanelVisible && routeInfo && getCurrentStep() && (
          <View style={[
            styles.topNavigationPanel,
            isNavigationMinimized && styles.minimizedNavigationPanel
          ]}>
            <View style={styles.navigationHeader}>
              <View style={styles.navigationInfo}>
                <Text style={styles.stepCounter}>
                  Paso {currentStepIndex + 1} de {routeInfo.steps.length}
                </Text>
                <Text style={styles.remainingDistance}>
                  {routeInfo.steps[currentStepIndex]?.distance.text} • {routeInfo.steps[currentStepIndex]?.duration.text}
                </Text>
              </View>
              <View style={styles.navigationControls}>
                <TouchableOpacity
                  onPress={() => setIsNavigationMinimized(!isNavigationMinimized)}
                  style={styles.minimizeButton}
                >
                  <Ionicons 
                    name={isNavigationMinimized ? 'chevron-down' : 'chevron-up'} 
                    size={20} 
                    color="#666" 
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNavigationPanelVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            </View>
            
            {!isNavigationMinimized && (
              <>
                <View style={styles.stepDetails}>
                  <View style={styles.directionIcon}>
                    <Ionicons 
                      name={getDirectionIcon(getCurrentStep()?.maneuver) as any} 
                      size={32} 
                      color="#4A90E2" 
                    />
                  </View>
                  <Text style={styles.stepInstructions}>
                    {cleanHtmlInstructions(getCurrentStep()!.html_instructions)}
                  </Text>
                </View>
                
                <View style={styles.progressBar}>
                  <View style={[
                    styles.progressFill,
                    { width: `${((currentStepIndex + 1) / routeInfo.steps.length) * 100}%` }
                  ]} />
                </View>
                
                <View style={styles.stepNavigation}>
                  <TouchableOpacity 
                    onPress={previousStep}
                    disabled={currentStepIndex === 0}
                    style={[styles.stepButton, currentStepIndex === 0 && styles.disabledButton]}
                  >
                    <Ionicons name="chevron-back" size={20} color="#4A90E2" />
                    <Text style={styles.stepButtonText}>Anterior</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={nextStep}
                    disabled={currentStepIndex >= routeInfo.steps.length - 1}
                    style={[styles.stepButton, currentStepIndex >= routeInfo.steps.length - 1 && styles.disabledButton]}
                  >
                    <Text style={styles.stepButtonText}>Siguiente</Text>
                    <Ionicons name="chevron-forward" size={20} color="#4A90E2" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )} */}

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

  // navigationButton: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   justifyContent: 'center',
  //   backgroundColor: '#F0F8FF',
  //   borderRadius: 8,
  //   paddingVertical: 12,
  //   paddingHorizontal: 20,
  //   marginTop: 10,
  //   borderWidth: 1,
  //   borderColor: '#4A90E2',
  // },
  // navigationButtonText: {
  //   color: '#4A90E2',
  //   fontSize: 16,
  //   fontWeight: '600',
  //   marginLeft: 8,
  // },
  // navigationTitle: {
  //   fontSize: 18,
  //   fontWeight: 'bold',
  //   color: '#333',
  // },
  // stepInfo: {
  //   marginBottom: 20,
  // },
  // currentStep: {
  //   backgroundColor: '#F8F9FA',
  //   padding: 15,
  //   borderRadius: 8,
  //   borderLeftWidth: 4,
  //   borderLeftColor: '#4A90E2',
  // },
  // stepDistance: {
  //   fontSize: 14,
  //   color: '#666',
  //   fontWeight: '500',
  // },
  // stepDuration: {
  //   fontSize: 14,
  //   color: '#666',
  //   fontWeight: '500',
  // },
  // navButton: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   backgroundColor: '#F0F8FF',
  //   borderRadius: 8,
  //   paddingVertical: 10,
  //   paddingHorizontal: 15,
  //   borderWidth: 1,
  //   borderColor: '#4A90E2',
  //   flex: 0.45,
  // },
  // navButtonText: {
  //   color: '#4A90E2',
  //   fontSize: 14,
  //   fontWeight: '600',
  //   marginHorizontal: 5,
  // },
  // compactNavigationPanel: {
  //   position: 'absolute',
  //   top: 0,
  //   left: 0,
  //   right: 0,
  //   zIndex: 1000,
  //   backgroundColor: '#FFFFFF',
  //   borderBottomLeftRadius: 12,
  //   borderBottomRightRadius: 12,
  //   padding: 15,
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   shadowColor: '#000',
  //   shadowOffset: { width: 0, height: 2 },
  //   shadowOpacity: 0.25,
  //   shadowRadius: 4,
  //   elevation: 5,
  // },
  // compactStepInfo: {
  //   flex: 1,
  //   marginRight: 10,
  // },
  // compactStepCounter: {
  //   fontSize: 12,
  //   color: '#666',
  //   marginBottom: 2,
  // },
  // compactStepInstructions: {
  //   fontSize: 16,
  //   color: '#333',
  //   fontWeight: '500',
  //   marginBottom: 2,
  // },
  // compactStepDistance: {
  //   fontSize: 12,
  //   color: '#4A90E2',
  //   fontWeight: '600',
  // },
  // nextStepButton: {
  //   backgroundColor: '#F0F8FF',
  //   borderRadius: 20,
  //   width: 40,
  //   height: 40,
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   borderWidth: 1,
  //   borderColor: '#4A90E2',
  // },
  // stepsList: {
  //   maxHeight: height * 0.6,
  // },
  // stepItem: {
  //   flexDirection: 'row',
  //   padding: 12,
  //   borderBottomWidth: 1,
  //   borderBottomColor: '#E0E0E0',
  //   alignItems: 'flex-start',
  // },
  // currentStepItem: {
  //   backgroundColor: '#F0F8FF',
  //   borderLeftWidth: 4,
  //   borderLeftColor: '#4A90E2',
  // },
  // stepNumber: {
  //   width: 30,
  //   height: 30,
  //   borderRadius: 15,
  //   backgroundColor: '#E0E0E0',
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   marginRight: 12,
  // },
  // stepNumberText: {
  //   fontSize: 14,
  //   fontWeight: '600',
  //   color: '#666',
  // },
  // stepContent: {
  //   flex: 1,
  // },
  // currentStepInstructions: {
  //   color: '#4A90E2',
  //   fontWeight: '600',
  // },
  // minimizedNavigationPanel: {
  //   paddingBottom: 10,
  // },
  // navigationHeader: {
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  //   alignItems: 'center',
  //   marginBottom: 10,
  // },
  // navigationInfo: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  // },
  // stepCounter: {
  //   fontSize: 14,
  //   fontWeight: '600',
  //   color: '#4A90E2',
  //   marginRight: 15,
  // },
  // remainingDistance: {
  //   fontSize: 14,
  //   fontWeight: '600',
  //   color: '#666',
  // },
  // navigationControls: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  // },
  // minimizeButton: {
  //   padding: 5,
  //   marginRight: 10,
  // },
  // closeButton: {
  //   padding: 5,
  // },
  // stepDetails: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   marginBottom: 15,
  // },
  // directionIcon: {
  //   marginRight: 15,
  // },
  // stepNavigation: {
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  // },
  // stepButton: {
  //   flexDirection: 'row',
  //   alignItems: 'center',
  //   backgroundColor: '#F0F8FF',
  //   borderRadius: 8,
  //   paddingVertical: 8,
  //   paddingHorizontal: 12,
  //   borderWidth: 1,
  //   borderColor: '#4A90E2',
  // },
  // stepButtonText: {
  //   color: '#4A90E2',
  //   fontSize: 14,
  //   fontWeight: '500',
  //   marginHorizontal: 5,
  // },
  // progressBar: {
  //   height: 4,
  //   backgroundColor: '#E0E0E0',
  //   borderRadius: 2,
  //   marginVertical: 10,
  //   overflow: 'hidden',
  // },
  // progressFill: {
  //   height: '100%',
  //   backgroundColor: '#4A90E2',
  // },
  // topNavigationPanel: {
  //   position: 'absolute',
  //   top: -610,
  //   left: 70,
  //   right: 20,
  //   backgroundColor: '#FFFFFF',
  //   borderRadius: 12,
  //   padding: 15,
  //   shadowColor: '#000',
  //   shadowOffset: { width: 0, height: 2 },
  //   shadowOpacity: 0.25,
  //   shadowRadius: 4,
  //   elevation: 5,
  //   zIndex: 1000,
  // },
  // stepInstructions: {
  //   flex: 1,
  //   fontSize: 16,
  //   fontWeight: '500',
  //   color: '#333',
  //   lineHeight: 22,
  // },

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
