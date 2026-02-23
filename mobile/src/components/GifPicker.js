import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, typography, borderRadius } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { fetchTrending, searchGifs } from '../services/giphy';

const SCREEN_WIDTH = Dimensions.get('window').width;
const COLUMN_GAP = 4;
const PADDING = spacing.lg;
const COLUMN_WIDTH = (SCREEN_WIDTH - PADDING * 2 - COLUMN_GAP) / 2;
const PAGE_SIZE = 20;

const GifPicker = ({ visible, onClose, onSelect }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [gifs, setGifs] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef(null);

  const loadGifs = useCallback(async (searchQuery, newOffset = 0, append = false) => {
    if (newOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const results = searchQuery
        ? await searchGifs(searchQuery, newOffset, PAGE_SIZE)
        : await fetchTrending(newOffset, PAGE_SIZE);
      if (append) {
        setGifs((prev) => [...prev, ...results]);
      } else {
        setGifs(results);
      }
      setOffset(newOffset + PAGE_SIZE);
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      console.warn('Failed to load GIFs:', err?.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setOffset(0);
      setHasMore(true);
      loadGifs('', 0, false);
    }
  }, [visible, loadGifs]);

  const handleSearch = (text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      loadGifs(text.trim(), 0, false);
    }, 400);
  };

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    loadGifs(query.trim(), offset, true);
  };

  const handleSelect = (gif) => {
    onSelect(gif);
    onClose();
  };

  const renderGif = ({ item }) => {
    const thumb = item.images?.fixed_width_small;
    if (!thumb?.url) return null;
    const aspectRatio = Number(thumb.width) / Number(thumb.height) || 1;
    return (
      <TouchableOpacity
        style={[styles.gifItem, { width: COLUMN_WIDTH }]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: thumb.url }}
          style={[styles.gifImage, { width: COLUMN_WIDTH, height: COLUMN_WIDTH / aspectRatio }]}
          resizeMode="cover"
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>GIFs</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search GIFs..."
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={handleSearch}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Grid */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(item) => item.id}
              renderItem={renderGif}
              numColumns={2}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.gridContent}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator style={{ padding: spacing.md }} color={colors.primary} />
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No GIFs found</Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* GIPHY attribution */}
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>Powered by GIPHY</Text>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: spacing.sm,
    height: '75%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    marginHorizontal: PADDING,
    marginBottom: spacing.sm,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
  },
  gridContent: {
    paddingBottom: spacing.md,
  },
  gifItem: {
    marginBottom: COLUMN_GAP,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  gifImage: {
    backgroundColor: colors.borderLight,
  },
  emptyContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  attribution: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  attributionText: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '600',
  },
});

export default GifPicker;
