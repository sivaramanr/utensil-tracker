import StocksDetailScreen from './screens/StocksDetailScreen';
import StocksHomeScreen from './screens/StocksHomeScreen';

const stocksModule = {
  id: 'stocks',
  displayName: 'Stocks',
  icon: 'layers-outline',
  iconBg: '#4f46e5',
  homeScreen: 'StocksHome',
  enabled: true,

  stacks: [
    { name: 'StocksHome',   component: StocksHomeScreen,   options: { headerShown: false } },
    { name: 'StocksDetail', component: StocksDetailScreen, options: { headerShown: false } },
  ],
};

export default stocksModule;
