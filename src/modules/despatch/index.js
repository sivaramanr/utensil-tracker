import DCChallanScreen from './screens/DCChallanScreen';
import DespatchHomeScreen from './screens/DespatchHomeScreen';
import DespatchItemsScreen from './screens/DespatchItemsScreen';

const despatchModule = {
  id: 'despatch',
  displayName: 'Despatch',
  icon: 'cube-outline',
  iconBg: '#059669',
  homeScreen: 'DespatchHome',
  enabled: true,

  stacks: [
    { name: 'DespatchHome',  component: DespatchHomeScreen,  options: { headerShown: false } },
    { name: 'DespatchItems', component: DespatchItemsScreen, options: { headerShown: false } },
    { name: 'DCChallan',     component: DCChallanScreen,     options: { headerShown: false } },
  ],
};

export default despatchModule;
