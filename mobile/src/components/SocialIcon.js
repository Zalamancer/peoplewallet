import React from 'react';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';

const SOCIAL_PLATFORMS = ['linkedin', 'instagram', 'twitter', 'github', 'discord', 'groupme', 'website'];

const getSocialLabel = (platform) => {
  const labels = {
    twitter: 'X',
    linkedin: 'LinkedIn',
    instagram: 'Instagram',
    github: 'GitHub',
    discord: 'Discord',
    groupme: 'GroupMe',
    website: 'Website',
  };
  return labels[platform] || platform.charAt(0).toUpperCase() + platform.slice(1);
};

const SocialIcon = ({ platform, size = 20, color }) => {
  switch (platform) {
    case 'twitter':
      return <FontAwesome6 name="x-twitter" size={size} color={color} />;
    case 'discord':
      return <FontAwesome6 name="discord" size={size} color={color} />;
    case 'linkedin':
      return <Ionicons name="logo-linkedin" size={size} color={color} />;
    case 'instagram':
      return <Ionicons name="logo-instagram" size={size} color={color} />;
    case 'github':
      return <Ionicons name="logo-github" size={size} color={color} />;
    case 'groupme':
      return <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />;
    case 'website':
      return <Ionicons name="globe-outline" size={size} color={color} />;
    default:
      return <Ionicons name="link-outline" size={size} color={color} />;
  }
};

export { SocialIcon, getSocialLabel, SOCIAL_PLATFORMS };
export default SocialIcon;
