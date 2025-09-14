# React Native Maps with BLE GPS Waypoint System

A React Native application that combines interactive mapping with Bluetooth Low Energy (BLE) communication to send GPS waypoints to external devices like ESP32 microcontrollers. Perfect for autonomous navigation systems, drone waypoint management, and IoT location-based projects.

## 🚀 Features

- **Interactive Map Interface**: Touch-based waypoint selection with visual route planning
- **Multi-Waypoint Support**: Add unlimited waypoints with source, intermediate, and destination markers
- **BLE Communication**: Seamless integration with ESP32 and other BLE-enabled devices
- **Real-time Location**: GPS-based current location display with permission handling
- **Route Visualization**: Polyline rendering between waypoints with distance calculations
- **Smart Device Management**: Automatic device discovery, connection caching, and retry logic
- **Cross-Platform**: Supports both Android and iOS with platform-specific optimizations

## 📱 Screenshots

The app displays an interactive map where users can:
- Tap to add waypoints (green for source, red for destination, blue for intermediate points)
- View route connections with polylines
- See total distance calculations
- Send waypoint data to BLE devices

## 🛠️ Technology Stack

- **React Native 0.74.2**: Core mobile framework
- **React Native Maps**: Interactive map component with Google Maps integration
- **React Native BLE PLX**: Bluetooth Low Energy communication
- **Geolib**: Geographical calculations and distance measurements
- **React Native Community Geolocation**: GPS location services

## 📋 Prerequisites

Before running this project, ensure you have:

- Node.js >= 18
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development)
- Physical device with BLE capabilities (recommended for BLE testing)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd React-Native-Maps
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure Google Maps API**
   - Get a Google Maps API key from Google Cloud Console
   - Replace the API key in `android/app/src/main/AndroidManifest.xml`:
     ```xml
     <meta-data
       android:name="com.google.android.geo.API_KEY"
       android:value="YOUR_API_KEY_HERE"/>
     ```

4. **iOS Setup** (iOS only)
   ```bash
   cd ios && pod install && cd ..
   ```

## 🚀 Running the App

### Android
```bash
npm run android
# or
yarn android
```

### iOS
```bash
npm run ios
# or
yarn ios
```

## 📖 Usage

### Adding Waypoints
1. Tap "Add Waypoint" button
2. Tap anywhere on the map to place a waypoint
3. First waypoint becomes the source (green marker)
4. Last waypoint becomes the destination (red marker)
5. Intermediate waypoints are marked in blue

### Managing Waypoints
- **Remove Last**: Removes the most recently added waypoint
- **Clear All**: Removes all waypoints from the map
- **Show Route Info**: Displays coordinates and total distance

### BLE Communication
1. Ensure your ESP32 or BLE device is powered and advertising
2. Tap "Send Waypoints" to transmit coordinate data
3. The app automatically scans and connects to compatible devices
4. Waypoint data is sent in base64-encoded format

### Device Scanning
- Use "Scan BLE Devices" for debugging and device discovery
- View all available BLE devices in your area

## 🔌 BLE Configuration

The app is configured to work with ESP32 devices using:
- **Service UUID**: `12345678-1234-1234-1234-1234567890ab`
- **Characteristic UUID**: `abcd1234-abcd-1234-abcd-1234567890ab`
- **Device Name Patterns**: `lorav32`, `lora-v32`, `lora_v32`

### Data Format
Waypoints are transmitted as:
```
WP1:latitude,longitude;WP2:latitude,longitude;WP3:latitude,longitude
```
Example: `WP1:37.788250,-122.432400;WP2:37.789000,-122.433000`

## 🔐 Permissions

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- BLUETOOTH / BLUETOOTH_ADMIN (API < 31)
- BLUETOOTH_SCAN / BLUETOOTH_CONNECT (API >= 31)

### iOS
- NSLocationWhenInUseUsageDescription
- Bluetooth permissions (handled automatically)

## 🏗️ Project Structure

```
├── App.js                 # Main application component
├── android/               # Android-specific configurations
├── ios/                   # iOS-specific configurations
├── package.json           # Dependencies and scripts
└── README.md             # Project documentation
```

## 🧪 Testing

```bash
npm test
# or
yarn test
```

## 📱 Platform-Specific Notes

### Android
- Requires location permissions for BLE scanning
- Google Maps API key must be configured
- Tested on API levels 21-34

### iOS
- Requires physical device for BLE testing
- Location permission handled automatically
- Compatible with iOS 11.0+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**BLE Connection Fails**
- Ensure device is powered and advertising
- Check device name patterns match your hardware
- Verify service/characteristic UUIDs are correct

**Location Not Working**
- Grant location permissions
- Enable location services on device
- Test on physical device (not simulator)

**Map Not Loading**
- Verify Google Maps API key is valid
- Check network connectivity
- Ensure API key has Maps SDK enabled

### Debug Mode
Enable debug logging by monitoring console output for detailed BLE and GPS operations.

## 🔗 Related Projects

- [ESP32 BLE GPS Receiver](link-to-esp32-project) - Compatible firmware for ESP32
- [React Native Maps Documentation](https://github.com/react-native-maps/react-native-maps)
- [React Native BLE PLX](https://github.com/Polidea/react-native-ble-plx)

## 📚 Learn More

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Google Maps API](https://developers.google.com/maps/documentation)
- [Bluetooth Low Energy Guide](https://developer.android.com/guide/topics/connectivity/bluetooth-le)

---

Built with ❤️ for autonomous navigation and IoT projects