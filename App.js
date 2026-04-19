import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-gesture-handler';
import CustomersScreen from './screens/CustomersScreen';
import DespatchedUtensilsScreen from './screens/DespatchedUtensilsScreen';
import HomeScreen from './screens/HomeScreen';
import IncomingScreen from './screens/IncomingScreen';
import ItemGroupScreen from './screens/ItemGroupScreen';
import LoginScreen from './screens/LoginScreen';
import MovementScreen from './screens/MovementScreen';
import OutgoingScreen from './screens/OutgoingScreen';
import ReturnedUtensilsScreen from './screens/ReturnedUtensilsScreen';
import SessionScreen from './screens/SessionScreen';
import SettingsScreen from './screens/SettingsScreen';
import UtensilScreen from './screens/UtensilScreen';
import UtensilTypeDetailScreen from './screens/UtensilTypeDetailScreen';
import UtensilTypesScreen from './screens/UtensilTypesScreen';
import { getTokens } from './utils/auth';
import { installSafeApiLogger } from './utils/networkLogger';

installSafeApiLogger();

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const tokens = await getTokens();
        setInitialRoute(tokens.accessToken ? 'Home' : 'Login');
      } catch (error) {
        console.log('Startup token check error:', error);
        setInitialRoute('Login');
      }
    };

    bootstrapAuth();
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ItemGroups"
          component={ItemGroupScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="UtensilTypes"
          component={UtensilTypesScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="UtensilTypeDetail"
          component={UtensilTypeDetailScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Session"
          component={SessionScreen}
          options={{
            title: 'Session',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Customers"
          component={CustomersScreen}
          options={{
            title: 'Customers',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Movement"
          component={MovementScreen}
          options={{
            title: 'Movement',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Utensil"
          component={UtensilScreen}
          options={{
            title: 'Utensil',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="DespatchedUtensils"
          component={DespatchedUtensilsScreen}
          options={{
            title: 'Despatched Utensils',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ReturnedUtensils"
          component={ReturnedUtensilsScreen}
          options={{
            title: 'Returned Utensils',
            headerTitleAlign: 'center',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Outgoing"
          component={OutgoingScreen}
          options={{
            title: 'Outgoing',
            headerTitleAlign: 'center',
          }}
        />
        <Stack.Screen
          name="Incoming"
          component={IncomingScreen}
          options={{
            title: 'Incoming',
            headerTitleAlign: 'center',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
