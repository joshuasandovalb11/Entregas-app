import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Delivery, DeliveryStatus } from '../types';

export default function Home() {
  const router = useRouter();
  const { authState, logout } = useAuth();
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>({
    hasActiveDelivery: false,
    currentDelivery: null,
    nextDeliveries: [],
  });

  useEffect(() => {
    // TODO: Fetch delivery status from API
    loadDeliveryStatus();
  }, []);

  const loadDeliveryStatus = async () => {
    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`YOUR_API_ENDPOINT/driver/${authState.driver?.driver_id}/status`);
      // const data = await response.json();
      
      // Mock data for now
      const mockData: DeliveryStatus = {
        hasActiveDelivery: false,
        currentDelivery: null,
        nextDeliveries: [
          {
            delivery_id: 1,
            driver_id: authState.driver?.driver_id || 1,
            client_id: 1,
            start_time: new Date().toISOString(),
            start_latitud: 32.5149,
            start_longitud: -117.0382,
            client: {
              client_id: 1,
              name: 'Juan Pérez',
              phone: 6641234567,
              gps_location: '32.5149,-117.0382',
            },
          },
        ],
      };
      
      setDeliveryStatus(mockData);
    } catch (error) {
    console.error('Error al cargar el estado de las entregas:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
        'Cerrar sesión',
        '¿Estás seguro que deseas cerrar sesión?',
        [
        { text: 'Cancelar', style: 'cancel' },
        { 
            text: 'Cerrar sesión', 
            style: 'destructive',
            onPress: async () => {
            await logout();
            router.replace('/login');
            }
        },
        ]
    );
  };

  const handleStartDelivery = () => {
    if (deliveryStatus.nextDeliveries.length > 0) {
      router.push('/map');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoSmall}>
            <Ionicons name="cube" size={24} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.welcomeText}>¡Hola!</Text>
            <Text style={styles.driverName}>
              {authState.driver?.username || 'Conductor'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#4A90E2" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Vehicle Info */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleHeader}>
            <Ionicons name="car" size={24} color="#4A90E2" />
            <Text style={styles.vehicleTitle}>Tu vehículo</Text>
          </View>
          <Text style={styles.vehicleInfo}>
            Unidad: {authState.driver?.num_unity || 'N/A'}
          </Text>
          <Text style={styles.vehicleInfo}>
            Placas: {authState.driver?.vehicle_plate || 'N/A'}
          </Text>
        </View>

        {/* Delivery Status */}
        {deliveryStatus.hasActiveDelivery ? (
          <View style={styles.activeDeliveryCard}>
            <View style={styles.activeDeliveryHeader}>
              <Ionicons name="location" size={24} color="#FFFFFF" />
              <Text style={styles.activeDeliveryTitle}>Entrega en progreso</Text>
            </View>
            <Text style={styles.activeDeliveryClient}>
              Cliente: {deliveryStatus.currentDelivery?.client?.name}
            </Text>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => router.push('/map')}
            >
              <Text style={styles.continueButtonText}>Continuar entrega</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noActiveDeliveryCard}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
            <Text style={styles.noActiveDeliveryTitle}>
              No hay entregas activas
            </Text>
            <Text style={styles.noActiveDeliveryText}>
              Listo para comenzar una nueva entrega
            </Text>
          </View>
        )}

        {/* Next Deliveries */}
        <View style={styles.nextDeliveriesCard}>
          <View style={styles.nextDeliveriesHeader}>
            <Ionicons name="time" size={24} color="#4A90E2" />
            <Text style={styles.nextDeliveriesTitle}>Próximas entregas</Text>
          </View>
          
          {deliveryStatus.nextDeliveries.length > 0 ? (
            <>
              {deliveryStatus.nextDeliveries.map((delivery, index) => (
                <View key={delivery.delivery_id} style={styles.deliveryItem}>
                  <Text style={styles.deliveryClient}>
                    {delivery.client?.name}
                  </Text>
                  <Text style={styles.deliveryPhone}>
                    {delivery.client?.phone}
                  </Text>
                </View>
              ))}
              
              <TouchableOpacity
                style={styles.startButton}
                onPress={handleStartDelivery}
              >
                <Ionicons name="play" size={20} color="#FFFFFF" />
                <Text style={styles.startButtonText}>Comenzar entrega</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noDeliveriesText}>
              No hay entregas programadas
            </Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsCard}>
          <Text style={styles.quickActionsTitle}>Acciones rápidas</Text>
          
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/agenda')}
            >
              <Ionicons name="calendar" size={24} color="#4A90E2" />
              <Text style={styles.actionButtonText}>Agenda</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/history')}
            >
              <Ionicons name="time" size={24} color="#4A90E2" />
              <Text style={styles.actionButtonText}>Historial</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    // paddingTop: 10
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoSmall: {
    width: 40,
    height: 40,
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  welcomeText: {
    fontSize: 14,
    color: '#666',
  },
  driverName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  vehicleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  vehicleInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  activeDeliveryCard: {
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
  },
  activeDeliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeDeliveryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  activeDeliveryClient: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  continueButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#4A90E2',
    fontSize: 16,
    fontWeight: '600',
  },
  noActiveDeliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  noActiveDeliveryTitle: {
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  noActiveDeliveryText: {
    fontSize: 14,
    justifyContent: 'center',
    textAlign: 'center',
    color: '#666',
    marginTop: 4,
  },
  nextDeliveriesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nextDeliveriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  nextDeliveriesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  deliveryItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  deliveryClient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  deliveryPhone: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  noDeliveriesText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  quickActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    padding: 16,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#4A90E2',
    marginTop: 8,
    fontWeight: '600',
  },
});