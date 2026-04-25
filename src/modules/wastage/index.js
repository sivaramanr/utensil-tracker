import WastageApprovalScreen from './screens/WastageApprovalScreen';
import WastageEntryScreen from './screens/WastageEntryScreen';
import WastageHomeScreen from './screens/WastageHomeScreen';

const wastageModule = {
  id: 'wastage',
  displayName: 'Wastage Tracker',
  icon: 'analytics-outline',
  iconBg: '#d97706',
  homeScreen: 'WastageHome',
  enabled: true,

  stacks: [
    { name: 'WastageHome',     component: WastageHomeScreen,     options: { headerShown: false } },
    { name: 'WastageEntry',    component: WastageEntryScreen,    options: { headerShown: false } },
    { name: 'WastageApproval', component: WastageApprovalScreen, options: { headerShown: false } },
  ],
};

export default wastageModule;
