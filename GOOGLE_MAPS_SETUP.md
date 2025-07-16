# Configuración de Google Maps API Key

## Pasos para configurar la API Key

### 1. Obtener API Key de Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita las siguientes APIs:
   - **Maps SDK for Android**
   - **Maps SDK for iOS**
   - **Directions API**
   - **Places API** (opcional, para búsqueda de lugares)

4. Ve a **Credenciales** → **Crear credenciales** → **Clave de API**
5. **Importante**: Configura restricciones de API para mayor seguridad

### 2. Configurar la API Key en la aplicación

1. Abre el archivo `.env` en la raíz del proyecto
2. Reemplaza `YOUR_GOOGLE_MAPS_API_KEY_HERE` con tu API Key real:
   ```
   GOOGLE_MAPS_API_KEY=tu_api_key_aqui
   ```

3. También actualiza el archivo `app.json` reemplazando `YOUR_GOOGLE_MAPS_API_KEY_HERE` con tu API Key en:
   - `android.config.googleMaps.apiKey`
   - `ios.config.googleMapsApiKey`

### 3. Restricciones de seguridad recomendadas

Para mayor seguridad, configura restricciones en Google Cloud Console:

#### Para Android:
- Restricción de aplicación: **Aplicaciones de Android**
- Nombre del paquete: `com.erick.sandoval10.entregasapp`
- Huella digital SHA-1: (obtén de tu keystore)

#### Para iOS:
- Restricción de aplicación: **Aplicaciones de iOS**
- Identificador del paquete: `com.erick.sandoval10.entregasapp`

### 4. Verificar funcionamiento

1. Reinicia el servidor de desarrollo:
   ```bash
   npm start
   ```

2. Prueba las funcionalidades:
   - Visualización del mapa
   - Cálculo de rutas
   - Marcadores de inicio y destino

### 5. Funcionalidades que requieren la API Key

- **Directions API**: Para calcular rutas óptimas
- **Maps SDK**: Para mostrar mapas nativos
- **Places API**: Para búsqueda de ubicaciones (si se implementa)

### 6. Costos y límites

- Revisa la [tabla de precios de Google Maps](https://cloud.google.com/maps-platform/pricing)
- Configura alertas de facturación
- Considera implementar caché para reducir llamadas a la API

### 7. Troubleshooting

#### Error: "This API project is not authorized to use this API"
- Verifica que hayas habilitado las APIs correctas
- Revisa las restricciones de la API Key

#### Error: "REQUEST_DENIED"
- Verifica que la API Key esté configurada correctamente
- Revisa los logs de Google Cloud Console

#### Las rutas no se muestran
- Verifica que la Directions API esté habilitada
- Revisa la consola del navegador/dispositivo para errores
