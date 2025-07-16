import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Delivery } from '../types';

const Agenda = () => {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [nextDeliveries, setNextDeliveries] = useState<Delivery[]>([]);

  useEffect(() => {
    // Simulate fetching data from an API
    const fetchData = async () => {
      // TODO: Replace with actual API call
      const currentDelivery = {
        delivery_id: 1,
        driver_id: 1,
        client_id: 1,
        start_time: new Date().toISOString(),
        start_latitud: 32.5149,
        start_longitud: -117.0382,
        client: {
          client_id: 1,
          name: 'Jose Torres',
          phone: 6641234567,
          gps_location: '32.5149,-117.0382',
        },
      };

      const futureDeliveries = [
        {
          delivery_id: 2,
          driver_id: 1,
          client_id: 2,
          start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour later
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 2,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
        {
          delivery_id: 3,
          driver_id: 1,
          client_id: 3,
          start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours later
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 3,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
        {
          delivery_id: 4,
          driver_id: 1,
          client_id: 4,
          start_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours later
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 4,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
      ];

      setDeliveries([currentDelivery]);
      setNextDeliveries(futureDeliveries);
    };

    fetchData();
  }, []);

  const renderDeliveryItem = (item: Delivery, isNext: boolean = false) => (
    <View style={[styles.deliveryCard, isNext ? styles.nextDeliveryCard : styles.currentDeliveryCard]}>
      <View style={styles.deliveryHeader}>
        <View style={[styles.avatarCircle, isNext ? styles.nextAvatar : styles.currentAvatar]}>
          <Text style={[styles.avatarText, isNext ? styles.nextAvatarText : styles.currentAvatarText]}>
            {item.client?.name.charAt(0) || 'A'}
          </Text>
        </View>
        <View style={styles.clientInfo}>
          <View style={[styles.clientNameBadge, isNext ? styles.nextClientBadge : styles.currentClientBadge]}>
            <Text style={[styles.clientNameText, isNext ? styles.nextClientText : styles.currentClientText]}>
              {item.client?.name} - 123456
            </Text>
          </View>
          <Text style={styles.addressText}>8 County Road 11/6</Text>
          <Text style={styles.locationText}>Mannington, WV, 26582 United States</Text>
        </View>
        <TouchableOpacity style={styles.phoneButton}>
          <Ionicons name="call" size={20} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCurrentDelivery = ({ item }: { item: Delivery }) => renderDeliveryItem(item, false);
  const renderNextDelivery = ({ item }: { item: Delivery }) => renderDeliveryItem(item, true);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Mi agenda</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Current Delivery Section */}
        {deliveries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Siguiente entrega</Text>
            <FlatList
              data={deliveries}
              renderItem={renderCurrentDelivery}
              keyExtractor={item => item.delivery_id.toString()}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}

        {/* Next Deliveries Section */}
        {nextDeliveries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entregas futuras</Text>
            <FlatList
              data={nextDeliveries}
              renderItem={renderNextDelivery}
              keyExtractor={item => item.delivery_id.toString()}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

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
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  deliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  currentDeliveryCard: {
    backgroundColor: '#FFFFFF',
  },
  nextDeliveryCard: {
    backgroundColor: '#FFFFFF',
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currentAvatar: {
    backgroundColor: '#4A90E2',
  },
  nextAvatar: {
    backgroundColor: '#4CAF50',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  currentAvatarText: {
    color: '#FFFFFF',
  },
  nextAvatarText: {
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
  },
  clientNameBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  currentClientBadge: {
    backgroundColor: '#E3F2FD',
  },
  nextClientBadge: {
    backgroundColor: '#E8F5E8',
  },
  clientNameText: {
    fontSize: 14,
    fontWeight: '600',
  },
  currentClientText: {
    color: '#4A90E2',
  },
  nextClientText: {
    color: '#4CAF50',
  },
  addressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
});

export default Agenda;