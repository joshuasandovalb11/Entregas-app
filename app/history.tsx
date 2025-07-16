import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Delivery } from '../types';

const History = () => {
  const router = useRouter();
  const [pastDeliveries, setPastDeliveries] = useState<Delivery[]>([]);

  useEffect(() => {
    // Simulate fetching past deliveries from an API
    const fetchData = async () => {
      // TODO: Replace with actual API call
      const mockPastDeliveries = [
        {
          delivery_id: 1,
          driver_id: 1,
          client_id: 1,
          start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          delivery_time: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), // 23 hours ago
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 1,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
        {
          delivery_id: 2,
          driver_id: 1,
          client_id: 2,
          start_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          delivery_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
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
          start_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
          delivery_time: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
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
          start_time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
          delivery_time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 4,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
        {
          delivery_id: 5,
          driver_id: 1,
          client_id: 5,
          start_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
          delivery_time: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000).toISOString(),
          start_latitud: 32.5149,
          start_longitud: -117.0382,
          client: {
            client_id: 5,
            name: 'Jose Torres',
            phone: 6641234567,
            gps_location: '32.5149,-117.0382',
          },
        },
      ];

      setPastDeliveries(mockPastDeliveries);
    };

    fetchData();
  }, []);

  const renderDelivery = ({ item }: { item: Delivery }) => (
    <View style={styles.deliveryCard}>
      <View style={styles.deliveryHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {item.client?.name.charAt(0) || 'A'}
          </Text>
        </View>
        <View style={styles.clientInfo}>
          <View style={styles.clientNameBadge}>
            <Text style={styles.clientNameText}>
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Entregas recientes</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {pastDeliveries.length > 0 ? (
          <FlatList
            data={pastDeliveries}
            renderItem={renderDelivery}
            keyExtractor={item => item.delivery_id.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={64} color="#CCC" />
            <Text style={styles.emptyStateTitle}>No hay entregas recientes</Text>
            <Text style={styles.emptyStateText}>
              Aquí aparecerán las entregas que hayas completado
            </Text>
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
  listContainer: {
    paddingTop: 20,
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
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e24a4aff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clientInfo: {
    flex: 1,
  },
  clientNameBadge: {
    backgroundColor: '#fde3e3ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  clientNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e24a4aff',
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default History;