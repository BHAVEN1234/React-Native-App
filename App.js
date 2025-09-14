import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  PermissionsAndroid,
  Alert,
  ActivityIndicator,
  Button,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import { getDistance } from 'geolib';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

global.Buffer = Buffer;
let bleManager = new BleManager();

const DEVICE_NAME_PATTERNS = ['lorav32', 'lora-v32', 'lora_v32'];
const BLE_SCAN_TIMEOUT = 8000;
const BLE_CONNECT_TIMEOUT = 10000;
const BLE_RETRY_DELAY = 2000;
const MAX_RETRIES = 3;
const CHUNK_SIZE = 20;
const CHUNK_DELAY = 50;
const HARD_CODED_DEVICE_ID = null;

// ESP32 BLE Service and Characteristic UUIDs
const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcd1234-abcd-1234-abcd-1234567890ab";

let lastKnownDevice = null;
let isDisconnecting = false;
let lastSentCoordinates = null;
let isScanning = false;
let currentScanTimeout = null;
let isSendingInProgress = false;

const cleanupBleState = async () => {
  console.log('🧹 Cleaning up BLE state...');
  try {
    if (isScanning) {
      bleManager.stopDeviceScan();
      isScanning = false;
    }
    
    if (currentScanTimeout) {
      clearTimeout(currentScanTimeout);
      currentScanTimeout = null;
    }
    
    if (lastKnownDevice) {
      try {
        await safelyDisconnectDevice(lastKnownDevice);
      } catch (err) {
        console.log('⚠️ Failed to disconnect cached device:', err.message);
      }
      lastKnownDevice = null;
    }
    
    isDisconnecting = false;
    isSendingInProgress = false;
    console.log('✅ BLE state cleanup complete');
  } catch (err) {
    console.log('⚠️ BLE cleanup failed:', err.message);
  }
};

const forceResetBleManager = async () => {
  if (isSendingInProgress) {
    console.log('⚠️ BLE operation in progress, skipping reset');
    return;
  }

  console.log('🔄 FORCE RESETTING BLE Manager (simulating Bluetooth toggle)...');
  try {
    isSendingInProgress = true;
    await cleanupBleState();
    
    console.log('💥 Destroying BLE manager...');
    await bleManager.destroy();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('🆕 Creating fresh BLE manager...');
    bleManager = new BleManager();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    lastKnownDevice = null;
    lastSentCoordinates = null;
    isScanning = false;
    isDisconnecting = false;
    currentScanTimeout = null;
    
    console.log('✅ BLE Manager completely reset and ready');
  } catch (err) {
    console.log('⚠️ BLE reset failed:', err.message);
    try {
      bleManager = new BleManager();
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (fallbackErr) {
      console.error('❌ Fallback BLE creation failed:', fallbackErr.message);
    }
  } finally {
    isSendingInProgress = false;
  }
};

const terminateSendOperation = async (success = false, message = '') => {
  console.log(`🏁 Terminating send operation (success: ${success})`);
  try {
    if (isScanning) {
      bleManager.stopDeviceScan();
      isScanning = false;
    }
    
    if (currentScanTimeout) {
      clearTimeout(currentScanTimeout);
      currentScanTimeout = null;
    }
    
    if (lastKnownDevice) {
      try {
        await safelyDisconnectDevice(lastKnownDevice);
      } catch (err) {
        console.log('⚠️ Disconnect during termination failed:', err.message);
      }
      
      if (!success) {
        console.log('🗑️ Clearing cached device due to failure');
        lastKnownDevice = null;
      } else {
        console.log('💾 Keeping cached device for potential reuse');
      }
    }
    
    isDisconnecting = false;
    isSendingInProgress = false;
    
    console.log('✅ Send operation terminated cleanly');
    if (message) {
      console.log(`📝 Result: ${message}`);
    }
  } catch (err) {
    console.log('⚠️ Error during send operation termination:', err.message);
    isScanning = false;
    isSendingInProgress = false;
    isDisconnecting = false;
    if (currentScanTimeout) {
      clearTimeout(currentScanTimeout);
      currentScanTimeout = null;
    }
  }
};

export default function App() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waypoints, setWaypoints] = useState([]);
  const [isChoosingWaypoint, setIsChoosingWaypoint] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    return () => {
      console.log('🧹 Component unmounting, cleaning up BLE state...');
      cleanupBleState();
    };
  }, []);

  const defaultLocation = {
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];
        if (Platform.Version >= 31) {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
        } else {
          permissions.push(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN
          );
        }

        const granted = await PermissionsAndroid.requestMultiple(permissions);
        const allGranted = Object.values(granted).every(
          result => result === PermissionsAndroid.RESULTS.GRANTED
        );

        if (allGranted) getCurrentLocation();
        else {
          Alert.alert('Permission Denied', 'Please grant all permissions.');
          setLocation(defaultLocation);
          setLoading(false);
        }
      } else getCurrentLocation();
    };

    requestPermissions();
  }, []);

  const getCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      position => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setLoading(false);
      },
      error => {
        Alert.alert('Location Error', error.message);
        setLocation(defaultLocation);
        setLoading(false);
      }
    );
  };

  const handleMapPress = async (e) => {
    try {
      const coord = e.nativeEvent.coordinate;
      
      if (isChoosingWaypoint) {
        console.log('📍 Adding new waypoint...');
        setWaypoints(prev => [...prev, coord]);
        setIsChoosingWaypoint(false);
        console.log('📍 New waypoint added, forcing BLE reset...');
        await forceResetBleManager();
        console.log('✅ Waypoint addition complete');
      }
    } catch (error) {
      console.error('❌ Error handling map press:', error);
      Alert.alert('Error', 'Failed to add waypoint. Please try again.');
      setIsChoosingWaypoint(false);
    }
  };

  const calculateTotalDistance = () => {
    if (waypoints.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      totalDistance += getDistance(waypoints[i], waypoints[i + 1]);
    }
    return totalDistance / 1000; // Convert to km
  };

  const showWaypoints = () => {
    if (waypoints.length === 0) {
      Alert.alert('No Waypoints', 'Add waypoints first.');
      return;
    }
    
    const waypointsList = waypoints.map((wp, index) => {
      const label = index === 0 ? 'Source' : 
                   index === waypoints.length - 1 ? 'Destination' : 
                   `Waypoint ${index + 1}`;
      return `${label}: ${wp.latitude.toFixed(6)}, ${wp.longitude.toFixed(6)}`;
    }).join('\n');
    
    const totalKm = calculateTotalDistance();
    
    Alert.alert(
      'Route Information',
      `${waypointsList}\n\nTotal Distance: ${totalKm.toFixed(2)} km`
    );
  };

  const removeLastWaypoint = async () => {
    try {
      if (waypoints.length === 0) {
        Alert.alert('No Waypoints', 'No waypoints to remove.');
        return;
      }
      
      console.log('📍 Removing last waypoint...');
      setWaypoints(prev => prev.slice(0, -1));
      console.log('📍 Last waypoint removed, forcing BLE reset...');
      await forceResetBleManager();
      console.log('✅ Waypoint removal complete');
    } catch (error) {
      console.error('❌ Error removing waypoint:', error);
      Alert.alert('Error', 'Failed to remove waypoint');
    }
  };

  const clearAllWaypoints = async () => {
    try {
      console.log('📍 Clearing all waypoints...');
      setWaypoints([]);
      console.log('📍 All waypoints cleared, forcing BLE reset...');
      await forceResetBleManager();
      console.log('✅ All waypoints cleared');
    } catch (error) {
      console.error('❌ Error clearing waypoints:', error);
      Alert.alert('Error', 'Failed to clear waypoints');
    }
  };

  const safelyDisconnectDevice = async device => {
    if (!device) return;
    try {
      isDisconnecting = true;
      console.log('🔌 Disconnecting from device...');
      await device.cancelConnection();
      console.log('✅ Device disconnected successfully');
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.warn('⚠️ Disconnect error:', err.message);
    } finally {
      isDisconnecting = false;
    }
  };

  const connectToDevice = async (device, retries = 0) => {
    try {
      console.log(`🔗 Attempting to connect to device: ${device.id}`);
      
      const connectPromise = bleManager.connectToDevice(device.id, { 
        requestMTU: 128,
        timeout: BLE_CONNECT_TIMEOUT 
      });
      
      const connected = await connectPromise;
      console.log('🔗 Device connected, discovering services...');
      
      await connected.discoverAllServicesAndCharacteristics();
      console.log('✅ Services discovered successfully');
      
      return connected;
    } catch (err) {
      console.warn(`❌ Connect attempt ${retries + 1} failed:`, err.message);
      if (retries < MAX_RETRIES) {
        console.log(`⏳ Retrying in ${BLE_RETRY_DELAY}ms...`);
        await new Promise(res => setTimeout(res, BLE_RETRY_DELAY));
        return connectToDevice(device, retries + 1);
      }
      throw err;
    }
  };

  const findWritableCharacteristic = async device => {
    try {
      const services = await device.services();
      console.log('📋 Available services:', services.length);
      
      for (const service of services) {
        console.log('🔍 Checking service:', service.uuid);
        const chars = await service.characteristics();
        for (const char of chars) {
          console.log('📝 Characteristic:', char.uuid, 'Writable:', char.isWritableWithResponse || char.isWritableWithoutResponse);
          
          if (char.uuid.toLowerCase() === CHARACTERISTIC_UUID.toLowerCase()) {
            console.log('✅ Found target characteristic!');
            return char;
          }
          
          if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
            console.log('⚠️ Using fallback writable characteristic:', char.uuid);
            return char;
          }
        }
      }
      throw new Error('No writable characteristic found.');
    } catch (error) {
      console.log('❌ Error finding characteristic:', error.message);
      throw error;
    }
  };

  const sendDataInChunks = async (device, serviceUUID, characteristicUUID, base64String) => {
    console.log('📤 Starting chunked transmission...');
    console.log('📤 Base64 data to send:', base64String);
    console.log('📤 Data length:', base64String.length);
    
    const chunks = [];
    for (let i = 0; i < base64String.length; i += CHUNK_SIZE) {
      chunks.push(base64String.slice(i, i + CHUNK_SIZE));
    }
    
    console.log('📦 Split into', chunks.length, 'chunks');
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      console.log(`📤 Sending chunk ${i + 1}/${chunks.length}: "${chunk}" (${chunk.length} chars)`);
      
      try {
        const chunkBuffer = Buffer.from(chunk, 'utf-8').toString('base64');
        await device.writeCharacteristicWithoutResponseForService(
          serviceUUID,
          characteristicUUID,
          chunkBuffer
        );
        console.log(`✅ Chunk ${i + 1} sent successfully`);
        await new Promise(res => setTimeout(res, CHUNK_DELAY));
      } catch (error) {
        console.log(`❌ Failed to send chunk ${i + 1}:`, error.message);
        throw error;
      }
    }
    
    console.log('✅ All chunks sent successfully!');
  };

  const validateCoordinates = (coord, name) => {
    if (!coord || typeof coord.latitude !== 'number' || typeof coord.longitude !== 'number') {
      throw new Error(`Invalid ${name} coordinate`);
    }
    if (coord.latitude < -90 || coord.latitude > 90) {
      throw new Error(`Invalid ${name} latitude: ${coord.latitude}`);
    }
    if (coord.longitude < -180 || coord.longitude > 180) {
      throw new Error(`Invalid ${name} longitude: ${coord.longitude}`);
    }
  };

  const sendCoordinates = async () => {
    try {
      if (waypoints.length < 2) {
        Alert.alert('Error', 'Add at least 2 waypoints (source and destination).');
        return;
      }
      
      // Validate all waypoints
      waypoints.forEach((waypoint, index) => {
        validateCoordinates(waypoint, `waypoint ${index + 1}`);
      });
      
    } catch (error) {
      console.error('❌ Waypoint validation failed:', error);
      Alert.alert('Error', `Invalid coordinates: ${error.message}`);
      return;
    }

    // Format waypoints as: WP1:lat,lng;WP2:lat,lng;WP3:lat,lng...
    const waypointStrings = waypoints.map((wp, index) => 
      `WP${index + 1}:${wp.latitude},${wp.longitude}`
    );
    const raw = waypointStrings.join(';');
    const base64String = Buffer.from(raw, 'utf-8').toString('base64');

    // Check if waypoints have changed
    const waypointsChanged = lastSentCoordinates !== raw;
    console.log('📊 Waypoints Change Analysis:');
    console.log('  🔄 Previous waypoints:', lastSentCoordinates || 'none');
    console.log('  🆕 Current waypoints:', raw);
    console.log('  📏 String comparison result:', waypointsChanged ? 'CHANGED' : 'SAME');
    console.log('  📱 Cached device present:', lastKnownDevice ? 'YES' : 'NO');
    
    const shouldScan = waypointsChanged || !lastKnownDevice;
    console.log('  🔍 Should perform scan:', shouldScan ? 'YES' : 'NO');
    
    if (waypointsChanged) {
      console.log('📍 ✅ Waypoints have changed - will perform fresh scan');
      lastKnownDevice = null;
      console.log('🗑️ Cleared cached device due to waypoint change');
    } else if (!lastKnownDevice) {
      console.log('📍 🔍 No cached device available - will perform scan');
    } else {
      console.log('📍 ♻️ Same waypoints and cached device available - will try cache first');
    }

    console.log('📍 Current waypoints:');
    waypoints.forEach((wp, index) => {
      const label = index === 0 ? 'Source' : 
                   index === waypoints.length - 1 ? 'Destination' : 
                   `Waypoint ${index + 1}`;
      console.log(`  ${label}: ${wp.latitude}, ${wp.longitude}`);
    });
    console.log('📤 Raw message:', raw);
    console.log('📤 Base64 encoded:', base64String);
    console.log('📤 Message length:', base64String.length);

    try {
      if (isScanning || isSendingInProgress) {
        console.log('⚠️ Operation already in progress, ignoring send request');
        Alert.alert('In Progress', 'Please wait for current operation to complete.');
        return;
      }

      isSendingInProgress = true;
      console.log('🚀 Starting waypoints send operation...');

      if (waypointsChanged) {
        console.log('🔄 Waypoints changed - forcing complete BLE reset...');
        await forceResetBleManager();
        console.log('⏳ Allowing BLE stack to settle after reset...');
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log('🧹 Same waypoints - using simple cleanup...');
        await cleanupBleState();
      }
      
      const state = await bleManager.state();
      console.log('📡 BLE State:', state);
      
      if (state !== 'PoweredOn') {
        Alert.alert('Bluetooth Off', 'Enable Bluetooth and try again.');
        await terminateSendOperation(false, 'Bluetooth not powered on');
        return;
      }

      // Try cached device ONLY if waypoints are exactly the same
      if (!waypointsChanged && lastKnownDevice && !shouldScan) {
        console.log('🚀 Attempting to use cached device for identical waypoints...');
        try {
          const connected = await connectToDevice(lastKnownDevice);
          await sendDataInChunks(connected, SERVICE_UUID, CHARACTERISTIC_UUID, base64String);
          
          Alert.alert('Success', 'Waypoints sent!');
          await terminateSendOperation(true, 'Cached device send successful');
          return;
        } catch (err) {
          console.log('❌ Cached device failed, falling back to scan:', err.message);
          lastKnownDevice = null;
        }
      }
      
      console.log('🔄 Proceeding with device scan...');

      if (HARD_CODED_DEVICE_ID) {
        console.log('🔧 Using hardcoded device ID:', HARD_CODED_DEVICE_ID);
        try {
          const connected = await connectToDevice({ id: HARD_CODED_DEVICE_ID });
          await sendDataInChunks(connected, SERVICE_UUID, CHARACTERISTIC_UUID, base64String);
          
          lastSentCoordinates = raw;
          lastKnownDevice = { id: HARD_CODED_DEVICE_ID };
          
          Alert.alert('Success', 'Waypoints sent!');
          await terminateSendOperation(true, 'Hardcoded device send successful');
          return;
        } catch (err) {
          Alert.alert('Hardcoded Connect Failed', err.message);
          await terminateSendOperation(false, `Hardcoded device failed: ${err.message}`);
          return;
        }
      }

      console.log('🔍 Starting BLE device scan...');
      isScanning = true;
      const scannedDevices = new Set();
      let foundDevices = [];

      const stopScanAndCleanup = () => {
        if (isScanning) {
          bleManager.stopDeviceScan();
          isScanning = false;
        }
        if (currentScanTimeout) {
          clearTimeout(currentScanTimeout);
          currentScanTimeout = null;
        }
      };

      currentScanTimeout = setTimeout(async () => {
        console.log('⏰ Scan timeout reached');
        stopScanAndCleanup();
        
        if (foundDevices.length > 0) {
          console.log(`🔄 Found ${foundDevices.length} devices total. Trying fallback connection to first found device...`);
          foundDevices.forEach((dev, index) => {
            console.log(`  Device ${index}: ${dev.id} - ${dev.name || dev.localName || 'unnamed'}`);
          });
          await tryConnectToDevice(foundDevices[0]);
        } else {
          Alert.alert('Timeout', 'Could not find any BLE devices. Make sure ESP32 is powered on and advertising.');
          await terminateSendOperation(false, 'Scan timeout - no devices found');
        }
      }, BLE_SCAN_TIMEOUT);

      const tryConnectToDevice = async (device) => {
        try {
          console.log(`🔗 Attempting connection to device: ${device.id}`);
          const connected = await connectToDevice(device);
          console.log('🔗 Connected to device, sending data...');
          await sendDataInChunks(connected, SERVICE_UUID, CHARACTERISTIC_UUID, base64String);
          
          lastSentCoordinates = raw;
          lastKnownDevice = device;
          console.log('✅ Waypoints sent successfully and cached');
          
          Alert.alert('Success', 'Waypoints sent!');
          await terminateSendOperation(true, 'Waypoints sent successfully');
        } catch (err) {
          console.log('❌ Connection failed:', err.message);
          Alert.alert('Connection Failed', err.message);
          await terminateSendOperation(false, `Connection failed: ${err.message}`);
        }
      };

      bleManager.startDeviceScan(null, { allowDuplicates: false }, async (error, device) => {
        if (error) {
          console.log('❌ Scan error:', error.message);
          stopScanAndCleanup();
          Alert.alert('Scan Error', error.message);
          await terminateSendOperation(false, `Scan error: ${error.message}`);
          return;
        }

        if (!device || scannedDevices.has(device.id)) return;

        scannedDevices.add(device.id);
        foundDevices.push(device);
        
        const name = (device.name || device.localName || '').toLowerCase();
        console.log(`🛰️ Scanned device: ${device.id} | name: "${name}" | original: "${device.name || device.localName || 'null'}"`);

        const advertisedServices = device.serviceUUIDs || [];
        const hasOurService = advertisedServices.some(uuid => 
          uuid.toLowerCase() === SERVICE_UUID.toLowerCase()
        );

        const shouldConnect = DEVICE_NAME_PATTERNS.some(pattern => {
          const matches = name.includes(pattern);
          console.log(`🔍 Checking pattern "${pattern}" against "${name}": ${matches}`);
          return matches;
        }) || hasOurService;

        console.log(`📡 Device services: [${advertisedServices.join(', ')}]`);
        console.log(`🎯 Has our service (${SERVICE_UUID}): ${hasOurService}`);

        if (shouldConnect) {
          console.log(`✅ Found matching device: ${device.id} (name match: ${name.length > 0}, service match: ${hasOurService})`);
          stopScanAndCleanup();
          await tryConnectToDevice(device);
        }
      });
    } catch (err) {
      console.log('❌ Send coordinates error:', err.message);
      Alert.alert('BLE Error', err.message);
      await terminateSendOperation(false, `General error: ${err.message}`);
    }
  };

  const scanBleDevices = async () => {
    try {
      if (isScanning) {
        Alert.alert('Already Scanning', 'Please wait for current scan to complete.');
        return;
      }

      console.log('🔍 Debug scan - forcing BLE reset for clean state...');
      await forceResetBleManager();
      
      const state = await bleManager.state();
      if (state !== 'PoweredOn') {
        Alert.alert('Bluetooth Off', 'Enable Bluetooth first.');
        return;
      }

      console.log('🔍 Starting BLE device scan for debugging...');
      isScanning = true;
      const foundDevices = [];
      let scanTimeout;

      scanTimeout = setTimeout(() => {
        if (isScanning) {
          bleManager.stopDeviceScan();
          isScanning = false;
        }
        
        const deviceList = foundDevices.map((dev, index) => {
          const services = (dev.serviceUUIDs || []).join(', ');
          return `${index + 1}. ${dev.name || dev.localName || 'Unnamed'}\n   ID: ${dev.id}\n   Services: ${services || 'None'}`;
        }).join('\n\n');
        
        Alert.alert(
          'BLE Scan Results', 
          foundDevices.length > 0 
            ? `Found ${foundDevices.length} devices:\n\n${deviceList}`
            : 'No BLE devices found. Check if ESP32 is powered on.'
        );
      }, 5000);

      bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          if (scanTimeout) clearTimeout(scanTimeout);
          isScanning = false;
          Alert.alert('Scan Error', error.message);
          return;
        }

        if (device && !foundDevices.find(d => d.id === device.id)) {
          foundDevices.push(device);
          const services = (device.serviceUUIDs || []).join(', ');
          console.log(`🛰️ Found: ${device.id} - ${device.name || device.localName || 'unnamed'} - Services: [${services}]`);
        }
      });
    } catch (err) {
      isScanning = false;
      Alert.alert('Scan Error', err.message);
    }
  };

  const getMarkerColor = (index) => {
    if (index === 0) return "green"; // Source
    if (index === waypoints.length - 1) return "red"; // Destination
    return "blue"; // Intermediate waypoints
  };

  const getMarkerTitle = (index) => {
    if (index === 0) return "Source";
    if (index === waypoints.length - 1) return "Destination";
    return `Waypoint ${index + 1}`;
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            showsUserLocation
            region={location}
            onPress={handleMapPress}>
            <Marker coordinate={location} title="Current Location" />
            {waypoints.map((waypoint, index) => (
              <Marker
                key={index}
                coordinate={waypoint}
                title={getMarkerTitle(index)}
                description={`${waypoint.latitude.toFixed(6)}, ${waypoint.longitude.toFixed(6)}`}
                pinColor={getMarkerColor(index)}
              />
            ))}
            {waypoints.length > 1 && (
              <Polyline
                coordinates={waypoints}
                strokeColor="#000"
                strokeWidth={2}
              />
            )}
          </MapView>
          <View style={styles.buttonContainer}>
            <View style={styles.buttonGroup}>
              <Button
                title={isChoosingWaypoint ? 'Tap Map for Waypoint' : 'Add Waypoint'}
                onPress={() => setIsChoosingWaypoint(true)}
              />
              <Button
                title="Remove Last"
                onPress={removeLastWaypoint}
                disabled={waypoints.length === 0}
              />
            </View>
            <View style={styles.buttonGroup}>
              <Button
                title="Clear All"
                onPress={clearAllWaypoints}
                disabled={waypoints.length === 0}
              />
              <Button
                title="Show Route Info"
                onPress={showWaypoints}
              />
            </View>
            <Button title="Send Waypoints" onPress={sendCoordinates} />
            <Button title="Scan BLE Devices" onPress={scanBleDevices} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  buttonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
});