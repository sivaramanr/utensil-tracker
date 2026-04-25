/**
 * Builds the root Stack.Navigator from platform screens + all enabled module stacks.
 *
 * Platform screens (Login, Settings, ModulesPage, Session, Customers) are always present.
 * Module stacks are injected dynamically based on the module registry.
 * Adding a new module requires only registering it in platform/config/modules.js.
 */

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enabledModules } from '../config/modules';
import CustomersScreen from '../screens/CustomersScreen';
import LoginScreen from '../screens/LoginScreen';
import ModulesPage from '../screens/ModulesPage';
import SessionScreen from '../screens/SessionScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();

const PLATFORM_STACKS = [
  { name: 'Login',       component: LoginScreen,     options: { headerShown: false } },
  { name: 'ModulesPage', component: ModulesPage,     options: { headerShown: false } },
  { name: 'Settings',    component: SettingsScreen,  options: { headerShown: false } },
  { name: 'Session',     component: SessionScreen,   options: { headerShown: false } },
  { name: 'Customers',   component: CustomersScreen, options: { headerShown: false } },
];

const MODULE_STACKS = enabledModules.flatMap((m) => m.stacks);

const ALL_STACKS = [...PLATFORM_STACKS, ...MODULE_STACKS];

export default function AppNavigator({ initialRouteName }) {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName}>
        {ALL_STACKS.map(({ name, component, options }) => (
          <Stack.Screen
            key={name}
            name={name}
            component={component}
            options={options ?? {}}
          />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
