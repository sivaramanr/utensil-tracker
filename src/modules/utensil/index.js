/**
 * Utensil Tracker module manifest.
 *
 * Navigation flow (Session + Customers are now platform screens):
 *   ModulesPage → UtensilHome → Session (platform) → Customers (platform) → Movement
 *                                                                          → Utensil
 *                                                                          → DespatchedUtensils
 *                                                                          → ReturnedUtensils
 *                                              → Outgoing / Incoming
 *   Settings → UtensilTypes → UtensilTypeDetail
 *           → ItemGroups
 */

import DespatchedUtensilsScreen from './screens/DespatchedUtensilsScreen';
import HomeScreen from './screens/HomeScreen';
import IncomingScreen from './screens/IncomingScreen';
import ItemGroupScreen from './screens/ItemGroupScreen';
import MovementScreen from './screens/MovementScreen';
import OutgoingScreen from './screens/OutgoingScreen';
import ReturnedUtensilsScreen from './screens/ReturnedUtensilsScreen';
import UtensilScreen from './screens/UtensilScreen';
import UtensilTypeDetailScreen from './screens/UtensilTypeDetailScreen';
import UtensilTypesScreen from './screens/UtensilTypesScreen';

const utensilModule = {
  id: 'utensil',
  displayName: 'Utensil Tracker',
  icon: 'restaurant-outline',
  iconBg: '#3b82f6',
  homeScreen: 'UtensilHome',
  enabled: true,

  stacks: [
    { name: 'UtensilHome',        component: HomeScreen,               options: { headerShown: false } },
    { name: 'Movement',           component: MovementScreen,           options: { headerShown: false } },
    { name: 'Utensil',            component: UtensilScreen,            options: { headerShown: false } },
    { name: 'DespatchedUtensils', component: DespatchedUtensilsScreen, options: { headerShown: false } },
    { name: 'ReturnedUtensils',   component: ReturnedUtensilsScreen,   options: { headerShown: false } },
    { name: 'Outgoing',           component: OutgoingScreen,           options: { title: 'Outgoing', headerTitleAlign: 'center' } },
    { name: 'Incoming',           component: IncomingScreen,           options: { title: 'Incoming', headerTitleAlign: 'center' } },
    { name: 'UtensilTypes',       component: UtensilTypesScreen,       options: { headerShown: false } },
    { name: 'UtensilTypeDetail',  component: UtensilTypeDetailScreen,  options: { headerShown: false } },
    { name: 'ItemGroups',         component: ItemGroupScreen,          options: { headerShown: false } },
  ],
};

export default utensilModule;
