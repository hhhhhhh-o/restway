import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchNearbyToilets } from '../features/toilets/overpass';
import type { Coordinates, Toilet } from '../features/toilets/types';

const SHUNYI_TEST_CENTER: Coordinates = { latitude: 40.1499, longitude: 116.6615 };

type Filter = 'all' | 'free' | 'wheelchair';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'free', label: '免费' },
  { id: 'wheelchair', label: '无障碍' },
];

const radiusOptions = [1, 2, 5, 10];

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) return `${distanceMeters} 米`;
  return `${(distanceMeters / 1_000).toFixed(1)} 公里`;
}

function detailLabels(toilet: Toilet) {
  const labels: string[] = [];

  if (toilet.fee === 'no') labels.push('免费');
  if (toilet.fee === 'yes') labels.push('收费');
  if (toilet.wheelchair === 'yes') labels.push('无障碍');
  if (toilet.openingHours === '24/7') labels.push('24 小时');

  return labels.length ? labels : ['设施信息待补充'];
}

function ToiletCard({ toilet, canNavigate }: { toilet: Toilet; canNavigate: boolean }) {
  const labels = detailLabels(toilet);
  const openDirections = () => {
    const destination = `${toilet.latitude},${toilet.longitude}`;
    void Linking.openURL(`https://maps.apple.com/?daddr=${destination}&dirflg=w`);
  };

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultTopRow}>
        <View style={styles.resultIcon}>
          <Text style={styles.resultIconText}>WC</Text>
        </View>
        <View style={styles.resultCopy}>
          <Text numberOfLines={1} style={styles.resultTitle}>{toilet.name}</Text>
          <Text numberOfLines={1} style={styles.resultMeta}>
            {formatDistance(toilet.distanceMeters)}{toilet.address ? ` · ${toilet.address}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        {labels.map((label) => (
          <View key={label} style={styles.statusPill}>
            <Text style={styles.statusText}>{label}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!canNavigate}
        onPress={openDirections}
        style={[styles.primaryButton, !canNavigate && styles.primaryButtonDisabled]}
      >
        <Text style={[styles.primaryButtonText, !canNavigate && styles.primaryButtonTextDisabled]}>
          {canNavigate ? '在 Apple 地图中步行导航' : '真实定位后可开始导航'}
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [locationLabel, setLocationLabel] = useState('尚未定位');
  const [toilets, setToilets] = useState<Toilet[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('请先定位，再搜索真正位于你附近的厕所');
  const [filter, setFilter] = useState<Filter>('all');
  const [isLocating, setIsLocating] = useState(false);
  const [isTestMode, setIsTestMode] = useState(false);
  const [searchRadiusKm, setSearchRadiusKm] = useState(2);

  const loadToilets = useCallback(async (coordinates: Coordinates, radiusKm: number) => {
    setLoadState('loading');
    setToilets([]);
    setMessage('正在查询 OpenStreetMap 公开数据…');

    try {
      const results = await fetchNearbyToilets(coordinates, radiusKm * 1_000);
      setToilets(results);
      setLoadState('ready');
      setMessage(results.length ? `在 ${radiusKm} 公里内找到 ${results.length} 个公开记录` : `${radiusKm} 公里内暂无公开记录`);
    } catch {
      setLoadState('error');
      setMessage('公开数据服务暂时无法连接，请稍后重试');
    }
  }, []);

  const visibleToilets = useMemo(() => {
    return toilets.filter((toilet) => {
      if (filter === 'free') return toilet.fee === 'no';
      if (filter === 'wheelchair') return toilet.wheelchair === 'yes';
      return true;
    });
  }, [filter, toilets]);

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('当前浏览器无法获取定位，可以选择顺义区测试模式');
      return;
    }

    setIsLocating(true);
    setMessage('正在请求定位权限…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextOrigin = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setOrigin(nextOrigin);
        setLocationLabel('我的位置');
        setIsTestMode(false);
        setIsLocating(false);
        void loadToilets(nextOrigin, searchRadiusKm);
      },
      () => {
        setIsLocating(false);
        setLoadState('idle');
        setMessage('未获得定位权限，可以改用顺义区测试模式');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const useShunyiTestArea = () => {
    setOrigin(SHUNYI_TEST_CENTER);
    setLocationLabel('顺义区 · 测试');
    setIsTestMode(true);
    setFilter('all');
    void loadToilets(SHUNYI_TEST_CENTER, searchRadiusKm);
  };

  const selectSearchRadius = (radiusKm: number) => {
    setSearchRadiusKm(radiusKm);
    if (origin) void loadToilets(origin, radiusKm);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>RESTWAY</Text>
            <Text style={styles.title}>附近厕所</Text>
          </View>
          <View style={styles.locationBadge}>
            <Text style={styles.locationDot}>●</Text>
            <Text style={styles.locationText}>{locationLabel}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isLocating}
          onPress={useMyLocation}
          style={({ pressed }) => [styles.locationButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.locationButtonIcon}>⌖</Text>
          <View style={styles.locationButtonCopy}>
            <Text style={styles.locationButtonTitle}>{isLocating ? '正在定位…' : '使用我的当前位置'}</Text>
            <Text style={styles.locationButtonHint}>仅用于本次附近搜索，不会保存</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={useShunyiTestArea}
          style={({ pressed }) => [styles.testAreaButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.testAreaText}>暂时无法定位？使用顺义区测试位置</Text>
        </Pressable>

        <View style={styles.radiusSection}>
          <View style={styles.radiusHeading}>
            <Text style={styles.radiusTitle}>查找范围</Text>
            <Text style={styles.radiusValue}>{searchRadiusKm} 公里</Text>
          </View>
          <View style={styles.radiusOptions}>
            {radiusOptions.map((radiusKm) => (
              <Pressable
                accessibilityRole="button"
                key={radiusKm}
                onPress={() => selectSearchRadius(radiusKm)}
                style={[styles.radiusChip, searchRadiusKm === radiusKm && styles.radiusChipActive]}
              >
                <Text style={[styles.radiusChipText, searchRadiusKm === radiusKm && styles.radiusChipTextActive]}>
                  {radiusKm} km
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loadState !== 'idle' && (
          <View style={styles.filters}>
            {filters.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.mapCard}>
          <View style={[styles.mapLine, styles.mapLineOne]} />
          <View style={[styles.mapLine, styles.mapLineTwo]} />
          <View style={[styles.mapLine, styles.mapLineThree]} />
          {loadState === 'ready' && toilets.length > 0 && (
            <>
              <View style={[styles.mapPin, styles.pinOne]}><Text style={styles.pinText}>WC</Text></View>
              <View style={[styles.mapPin, styles.pinTwo]}><Text style={styles.pinText}>WC</Text></View>
              <View style={styles.userPin}><View style={styles.userPinCore} /></View>
            </>
          )}
          <View style={styles.mapMessage}>
            <Text style={styles.mapMessageTitle}>{message}</Text>
            <Text style={styles.mapMessageMeta}>
              {loadState === 'idle' ? '不会在未定位时自动显示北京中心结果' : `搜索半径 ${searchRadiusKm} 公里 · 地图视图下一步接入`}
            </Text>
          </View>
        </View>

        {isTestMode && (
          <View style={styles.testNotice}>
            <Text style={styles.testNoticeTitle}>当前是顺义区测试模式</Text>
            <Text style={styles.testNoticeText}>距离按顺义城区测试坐标计算，并非你的真实位置；为避免误导，导航暂不可用。</Text>
          </View>
        )}

        {loadState === 'error' && origin && (
          <Pressable accessibilityRole="button" onPress={() => void loadToilets(origin, searchRadiusKm)} style={styles.retryButton}>
            <Text style={styles.retryText}>重新加载公开数据</Text>
          </Pressable>
        )}

        {loadState === 'ready' && visibleToilets.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{toilets.length === 0 ? `${searchRadiusKm} 公里内暂无公开记录` : '当前筛选下没有结果'}</Text>
            <Text style={styles.emptyText}>
              {toilets.length === 0 ? '这不代表现实中没有厕所，可以扩大查找范围继续搜索。' : '可以切换到“全部”查看未标注设施属性的记录。'}
            </Text>
          </View>
        )}

        {loadState !== 'idle' && (
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>{isTestMode ? '顺义区测试结果' : '距离最近'}</Text>
            {loadState === 'ready' && <Text style={styles.resultsCount}>显示 {Math.min(visibleToilets.length, 8)} 条</Text>}
          </View>
        )}

        {visibleToilets.slice(0, 8).map((toilet) => (
          <ToiletCard canNavigate={!isTestMode} key={toilet.id} toilet={toilet} />
        ))}

        {loadState !== 'idle' && (
          <Pressable onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}>
            <Text style={styles.attribution}>地点数据 © OpenStreetMap 贡献者 · 公开记录可能不完整</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F6' },
  page: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, paddingBottom: 36 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { color: '#0C7C68', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginBottom: 4 },
  title: { color: '#14201D', fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  locationDot: { color: '#0C7C68', fontSize: 10 },
  locationText: { color: '#53605C', fontSize: 13, fontWeight: '600' },
  locationButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderRadius: 18, backgroundColor: '#FFFFFF', marginBottom: 14 },
  buttonPressed: { opacity: 0.72 },
  locationButtonIcon: { color: '#0A7AFF', fontSize: 27, marginRight: 11 },
  locationButtonCopy: { flex: 1 },
  locationButtonTitle: { color: '#14201D', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  locationButtonHint: { color: '#7C8783', fontSize: 12 },
  chevron: { color: '#94A09C', fontSize: 28 },
  testAreaButton: { alignItems: 'center', paddingVertical: 4, marginBottom: 16 },
  testAreaText: { color: '#0A7AFF', fontSize: 13, fontWeight: '600' },
  radiusSection: { padding: 15, borderRadius: 18, backgroundColor: '#FFFFFF', marginBottom: 14 },
  radiusHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  radiusTitle: { color: '#26332F', fontSize: 14, fontWeight: '700' },
  radiusValue: { color: '#08735F', fontSize: 13, fontWeight: '700' },
  radiusOptions: { flexDirection: 'row', gap: 8 },
  radiusChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12, backgroundColor: '#EEF1F0' },
  radiusChipActive: { backgroundColor: '#DDF4EE' },
  radiusChipText: { color: '#6B7773', fontSize: 13, fontWeight: '600' },
  radiusChipTextActive: { color: '#08735F' },
  filters: { flexDirection: 'row', gap: 9, marginBottom: 16 },
  filterChip: { borderRadius: 999, backgroundColor: '#E8ECEA', paddingHorizontal: 14, paddingVertical: 9 },
  filterChipActive: { backgroundColor: '#DDF4EE' },
  filterText: { color: '#65716D', fontSize: 14, fontWeight: '600' },
  filterTextActive: { color: '#08735F' },
  mapCard: { height: 270, overflow: 'hidden', position: 'relative', borderRadius: 28, backgroundColor: '#DDE8E4', marginBottom: 14 },
  mapLine: { position: 'absolute', height: 7, borderRadius: 999, backgroundColor: '#FFFFFF', opacity: 0.82, transform: [{ rotate: '-18deg' }] },
  mapLineOne: { width: 430, top: 54, left: -42 },
  mapLineTwo: { width: 390, top: 165, left: 90, transform: [{ rotate: '24deg' }] },
  mapLineThree: { width: 300, top: 215, left: -35, transform: [{ rotate: '8deg' }] },
  mapPin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 45, height: 45, borderRadius: 23, backgroundColor: '#FFFFFF', shadowColor: '#071B16', shadowOpacity: 0.13, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  pinOne: { top: 54, right: 54 },
  pinTwo: { bottom: 57, left: 58 },
  pinText: { color: '#08735F', fontSize: 12, fontWeight: '800' },
  userPin: { position: 'absolute', top: 120, left: '48%', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10, 122, 255, 0.22)' },
  userPinCore: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#0A7AFF' },
  mapMessage: { position: 'absolute', left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.94)' },
  mapMessageTitle: { color: '#26332F', fontSize: 13, fontWeight: '700', marginBottom: 3 },
  mapMessageMeta: { color: '#71807B', fontSize: 11 },
  testNotice: { padding: 15, borderRadius: 16, backgroundColor: '#FFF6DC', marginBottom: 14 },
  testNoticeTitle: { color: '#745900', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  testNoticeText: { color: '#806D2E', fontSize: 12, lineHeight: 18 },
  retryButton: { alignItems: 'center', paddingVertical: 13, borderWidth: 1, borderColor: '#B7DCD3', borderRadius: 15, backgroundColor: '#F5FFFC', marginBottom: 16 },
  retryText: { color: '#08735F', fontSize: 14, fontWeight: '700' },
  emptyCard: { padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF', marginBottom: 16 },
  emptyTitle: { color: '#26332F', fontSize: 15, fontWeight: '700', marginBottom: 5 },
  emptyText: { color: '#71807B', fontSize: 13, lineHeight: 19 },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 10 },
  resultsTitle: { color: '#14201D', fontSize: 20, fontWeight: '700' },
  resultsCount: { color: '#7C8783', fontSize: 12 },
  resultCard: { padding: 18, borderRadius: 24, backgroundColor: '#FFFFFF', marginBottom: 12, shadowColor: '#071B16', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  resultTopRow: { flexDirection: 'row', alignItems: 'center' },
  resultIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#DDF4EE' },
  resultIconText: { color: '#08735F', fontWeight: '800', fontSize: 13 },
  resultCopy: { flex: 1, paddingLeft: 12 },
  resultTitle: { color: '#14201D', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  resultMeta: { color: '#6F7B77', fontSize: 13 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14, marginBottom: 14 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#E3F7E8' },
  statusText: { color: '#1A7B3F', fontSize: 12, fontWeight: '700' },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#0A7AFF' },
  primaryButtonDisabled: { backgroundColor: '#E8ECEA' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  primaryButtonTextDisabled: { color: '#75807C' },
  attribution: { color: '#7C8783', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7, paddingHorizontal: 14 },
});
