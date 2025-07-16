import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Driver } from '../types';

// Se define el tipo de Driver sin la contraseña
export type DriverPublic = Omit<Driver, 'password'>;

export interface AuthState {
  isAuthenticated: boolean;
  driver: DriverPublic | null;
  token: string | null;
}

interface AuthContextType {
  authState: AuthState;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    driver: null,
    token: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const driverData = await AsyncStorage.getItem('driverData');

      if (token && driverData) {
        const driver: DriverPublic = JSON.parse(driverData);
        setAuthState({
          isAuthenticated: true,
          driver,
          token,
        });
      }
    } catch (error) {
    console.error('Error al verificar el estado de autenticación:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      // Simulación temporal de login
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!username || !password) {
        console.error('Usuario o contraseña vacíos');
        return false;
      }

      // Simula driver obtenido del servidor, sin password
      const driver: DriverPublic = {
        driver_id: 1,
        username: username,
        num_unity: 'Unidad 7',
        vehicle_plate: 'XYZ-1234',
      };

      const token = 'mock-token';

      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('driverData', JSON.stringify(driver));

      setAuthState({
        isAuthenticated: true,
        driver,
        token,
      });

      return true;
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('driverData');

      setAuthState({
        isAuthenticated: false,
        driver: null,
        token: null,
      });
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ authState, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};