import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredLocation {
  tracking_id: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

export const LocationStorage = {
  // Obtener todas las ubicaciones guardadas
  async getLocations(): Promise<StoredLocation[]> {
    try {
      const locationsJson = await AsyncStorage.getItem('saved_locations');
      return locationsJson ? JSON.parse(locationsJson) : [];
    } catch (error) {
      console.error('Error obteniendo ubicaciones:', error);
      return [];
    }
  },

  // Limpiar todas las ubicaciones
  async clearLocations(): Promise<void> {
    try {
      await AsyncStorage.removeItem('saved_locations');
    } catch (error) {
      console.error('Error limpiando ubicaciones:', error);
    }
  },

  // Obtener estadísticas de ubicaciones
  async getLocationStats(): Promise<{
    count: number;
    firstLocation?: StoredLocation;
    lastLocation?: StoredLocation;
  }> {
    try {
      const locations = await this.getLocations();
      return {
        count: locations.length,
        firstLocation: locations[0],
        lastLocation: locations[locations.length - 1],
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { count: 0 };
    }
  },

  // Exportar ubicaciones como string para debug
  async exportLocations(): Promise<string> {
    try {
      const locations = await this.getLocations();
      return JSON.stringify(locations, null, 2);
    } catch (error) {
      console.error('Error exportando ubicaciones:', error);
      return 'Error al exportar ubicaciones';
    }
  },
};
