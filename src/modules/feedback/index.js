import FeedbackContactsScreen from './screens/FeedbackContactsScreen';
import FeedbackHomeScreen from './screens/FeedbackHomeScreen';
import FeedbackQRScreen from './screens/FeedbackQRScreen';

const feedbackModule = {
  id: 'feedback',
  displayName: 'Feedbacks',
  icon: 'chatbubble-ellipses-outline',
  iconBg: '#7c3aed',
  homeScreen: 'FeedbackHome',
  enabled: true,

  stacks: [
    { name: 'FeedbackHome',     component: FeedbackHomeScreen,     options: { headerShown: false } },
    { name: 'FeedbackContacts', component: FeedbackContactsScreen, options: { headerShown: false } },
    { name: 'FeedbackQR',       component: FeedbackQRScreen,       options: { headerShown: false } },
  ],
};

export default feedbackModule;
