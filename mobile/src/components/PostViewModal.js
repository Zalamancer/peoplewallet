import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SocialIcon } from './SocialIcon';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import ShareToChatModal from './ShareToChatModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PLATFORM_CONFIG = {
  linkedin: { color: '#0A66C2', label: 'LinkedIn' },
  instagram: { color: '#E1306C', label: 'Instagram' },
  twitter: { color: '#000000', label: 'X' },
  github: { color: '#333333', label: 'GitHub' },
  discord: { color: '#5865F2', label: 'Discord' },
  groupme: { color: '#00AFF0', label: 'GroupMe' },
  tiktok: { color: '#000000', ionicon: 'musical-notes', label: 'TikTok' },
  facebook: { color: '#1877F2', ionicon: 'logo-facebook', label: 'Facebook' },
  default: { color: null, ionicon: 'globe-outline', label: 'Web' },
};

const PostViewModal = ({ visible, onClose, item }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showShareChat, setShowShareChat] = useState(false);

  if (!item) return null;

  const platformEntry = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.default;
  const platform = { ...platformEntry, color: platformEntry.color || colors.primary };

  const handleOpenInBrowser = () => {
    const url = item.content_url || item.embed_url;
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const hasEmbed = !!item.html_embed;
  const hasThumbnail = !!item.thumbnail_url;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.platformInfo}>
            {platform.ionicon ? (
              <Ionicons name={platform.ionicon} size={22} color={platform.color} />
            ) : (
              <SocialIcon platform={item.platform} size={22} color={platform.color} />
            )}
            <Text style={[styles.platformLabel, { color: platform.color }]}>{platform.label}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Content — native card rendering (no WebView dependency) */}
        <ScrollView style={styles.nativeContent} showsVerticalScrollIndicator={false}>
            {/* Thumbnail */}
            {hasThumbnail && (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            )}

            {/* Author info */}
            {(item.embed_author || item.contact_name) && (
              <View style={styles.authorRow}>
                <Text style={styles.authorName}>{item.embed_author || item.contact_name}</Text>
                {item.author_handle && (
                  <Text style={styles.authorHandle}>@{item.author_handle}</Text>
                )}
              </View>
            )}

            {/* Title */}
            {(item.embed_title || item.title) && (
              <Text style={styles.postTitle}>{item.embed_title || item.title}</Text>
            )}

            {/* Description */}
            {(item.embed_description || item.summary) && (
              <Text style={styles.postDescription}>
                {item.embed_description || item.summary}
              </Text>
            )}

            {/* Platform link preview */}
            <View style={styles.linkPreview}>
              {platform.ionicon ? (
                <Ionicons name={platform.ionicon} size={40} color={platform.color} style={{ opacity: 0.5 }} />
              ) : (
                <SocialIcon platform={item.platform} size={40} color={platform.color} />
              )}
              <Text style={styles.linkPreviewText}>
                View full post on {platform.label}
              </Text>
            </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.openBrowserButton} onPress={() => setShowShareChat(true)}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.primary} />
              <Text style={styles.openBrowserText}>Share to Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.openBrowserButton} onPress={handleOpenInBrowser}>
              <Ionicons name="open-outline" size={18} color={colors.primary} />
              <Text style={styles.openBrowserText}>Open in Browser</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Share to Chat Modal */}
        <ShareToChatModal
          visible={showShareChat}
          onClose={() => setShowShareChat(false)}
          messageType="post_card"
          content={`Shared a post: ${item.embed_title || item.title || 'Post'}`}
          metadata={{
            content_url: item.content_url,
            title: item.embed_title || item.title,
            description: item.embed_description || item.summary,
            thumbnail_url: item.thumbnail_url,
            platform: item.platform,
            author: item.embed_author || item.contact_name,
          }}
          preview={{
            title: item.embed_title || item.title || 'Post',
            subtitle: item.embed_author || item.contact_name,
            imageUrl: item.thumbnail_url,
          }}
          shareUrl={item.content_url}
        />
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  platformInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  platformLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },

  // Content
  nativeContent: {
    flex: 1,
    padding: spacing.lg,
  },
  thumbnail: {
    width: SCREEN_WIDTH - spacing.lg * 2,
    height: (SCREEN_WIDTH - spacing.lg * 2) * 0.6,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  authorRow: {
    marginBottom: spacing.md,
  },
  authorName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  authorHandle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
  postTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  postDescription: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  linkPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  linkPreviewText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },

  // Footer
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  openBrowserButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primaryBg,
    gap: spacing.sm,
  },
  openBrowserText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default PostViewModal;
