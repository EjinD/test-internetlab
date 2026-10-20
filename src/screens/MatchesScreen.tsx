import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FavoriteButton } from '../components/FavoriteButton';
import { UpdatedAgo } from '../components/UpdatedAgo';
import { MATCHES_URL } from '../config';
import { useFavorites } from '../hooks/useFavorites';

type Team = {
  id?: string | null;
  name?: string | null;
  city?: string | null;
};

type Score = { home: number; away: number };

type Match = {
  id: string;
  startsAt?: string | null;
  status: string;
  minute?: number | null;
  home?: Team | null;
  away?: Team | null;
  score?: Score | null;
};

type MatchesResponse = { round?: number | null; matches: Match[] };
type Filter = 'all' | 'upcoming' | 'finished';

const STATUS_LABELS: Record<string, string> = {
  finished: 'Завершён',
  live: 'Идёт',
  scheduled: 'Предстоящий',
  postponed: 'Перенесён',
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'upcoming', label: 'Предстоящие' },
  { key: 'finished', label: 'Завершённые' },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function isTeam(value: unknown): value is Team {
  return isObject(value) &&
    isOptionalString(value.id) &&
    isOptionalString(value.name) &&
    isOptionalString(value.city);
}

function isScore(value: unknown): value is Score {
  return isObject(value) &&
    typeof value.home === 'number' && Number.isFinite(value.home) &&
    typeof value.away === 'number' && Number.isFinite(value.away);
}

function isMatch(value: unknown): value is Match {
  return isObject(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.status === 'string' &&
    isOptionalString(value.startsAt) &&
    (value.minute == null || (typeof value.minute === 'number' && Number.isFinite(value.minute))) &&
    (value.home == null || isTeam(value.home)) &&
    (value.away == null || isTeam(value.away)) &&
    (value.score == null || isScore(value.score));
}

function isMatchesResponse(value: unknown): value is MatchesResponse {
  return isObject(value) &&
    Array.isArray(value.matches) &&
    value.matches.every(isMatch) &&
    (value.round == null || (typeof value.round === 'number' && Number.isFinite(value.round)));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Дата не определена';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не определена';

  // Без timeZone дата и время выводятся в часовом поясе устройства.
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function MatchCard({
  match,
  favorite,
  onToggleFavorite,
}: {
  match: Match;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const status = STATUS_LABELS[match.status] ?? 'Статус неизвестен';
  const score = match.score ? match.score.home + ' : ' + match.score.away : '— : —';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.date}>{formatDate(match.startsAt)}</Text>
        <FavoriteButton active={favorite} onPress={onToggleFavorite} />
      </View>

      <View style={styles.teamsRow}>
        <View style={styles.teamColumn}>
          <Text style={styles.teamName}>{match.home?.name || 'Неизвестная команда'}</Text>
          {!!match.home?.city && <Text style={styles.city}>{match.home.city}</Text>}
        </View>
        <View style={styles.scoreColumn}>
          <Text style={styles.score}>{score}</Text>
          {match.status === 'live' && match.minute != null && (
            <Text style={styles.minute}>{match.minute}′</Text>
          )}
        </View>
        <View style={[styles.teamColumn, styles.awayTeam]}>
          <Text style={styles.teamName}>{match.away?.name || 'Неизвестная команда'}</Text>
          {!!match.away?.city && <Text style={styles.city}>{match.away.city}</Text>}
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View style={[styles.statusDot, match.status === 'live' && styles.liveDot]} />
        <Text style={styles.status}>{status}</Text>
      </View>
    </View>
  );
}

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { isFavorite, toggle } = useFavorites();

  const loadMatches = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(MATCHES_URL);
      if (!response.ok) throw new Error('HTTP request failed');

      const payload: unknown = await response.json();
      if (!isMatchesResponse(payload)) throw new Error('Invalid matches response');

      setMatches(payload.matches);
      setRound(typeof payload.round === 'number' ? payload.round : null);
      setLastUpdated(new Date());
    } catch {
      setError('Не удалось загрузить матчи. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const visibleMatches = useMemo(() => {
    if (filter === 'upcoming') return matches.filter((match) => match.status === 'scheduled');
    if (filter === 'finished') return matches.filter((match) => match.status === 'finished');
    return matches;
  }, [filter, matches]);

  const retry = () => void loadMatches(matches.length > 0);

  if (loading && matches.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.muted}>Загружаем матчи…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Матчи тура</Text>
          <Text style={styles.subtitle}>
            {round != null ? 'Тур ' + round : 'Результаты и расписание'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Обновить список матчей"
          accessibilityState={{ disabled: refreshing }}
          disabled={refreshing}
          onPress={() => void loadMatches(true)}
          style={[styles.refreshButton, refreshing && styles.disabledButton]}
        >
          <Text style={styles.refreshText}>{refreshing ? 'Обновляем…' : '↻ Обновить'}</Text>
        </Pressable>
      </View>

      {lastUpdated && <UpdatedAgo since={lastUpdated} />}

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const selected = filter === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setFilter(item.key)}
              style={[styles.filterButton, selected && styles.activeFilter]}
            >
              <Text style={[styles.filterText, selected && styles.activeFilterText]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error && matches.length === 0 ? (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {error && (
            <View style={styles.inlineErrorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={retry}>
                <Text style={styles.inlineRetryText}>Повторить</Text>
              </Pressable>
            </View>
          )}
          <FlatList
            data={visibleMatches}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MatchCard
                match={item}
                favorite={isFavorite(item.id)}
                onToggleFavorite={() => toggle(item.id)}
              />
            )}
            contentContainerStyle={visibleMatches.length === 0 ? styles.emptyList : styles.list}
            ListEmptyComponent={(
              <Text style={styles.emptyText}>
                {matches.length === 0 ? 'Матчей пока нет.' : 'В этой категории матчей нет.'}
              </Text>
            )}
            refreshControl={(
              <RefreshControl refreshing={refreshing} onRefresh={() => void loadMatches(true)} />
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 3, fontSize: 14, color: '#64748b' },
  muted: { color: '#64748b', fontSize: 14 },
  refreshButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#dbeafe' },
  disabledButton: { opacity: 0.6 },
  refreshText: { color: '#1d4ed8', fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  filterButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#e5e7eb' },
  activeFilter: { backgroundColor: '#2563eb' },
  filterText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  activeFilterText: { color: '#fff' },
  list: { paddingBottom: 24 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { textAlign: 'center', color: '#64748b', fontSize: 15 },
  card: { padding: 16, marginBottom: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  date: { flex: 1, fontSize: 12, color: '#64748b' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamColumn: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  city: { marginTop: 4, fontSize: 12, color: '#94a3b8' },
  scoreColumn: { alignItems: 'center', minWidth: 64 },
  score: { fontSize: 20, fontWeight: '800', color: '#111827' },
  minute: { marginTop: 2, color: '#dc2626', fontWeight: '700', fontSize: 12 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#94a3b8' },
  liveDot: { backgroundColor: '#dc2626' },
  status: { fontSize: 12, color: '#64748b' },
  messageBox: { alignItems: 'center', padding: 24, gap: 14 },
  errorText: { color: '#b91c1c', textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: '#2563eb', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  inlineErrorBox: { padding: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fee2e2', gap: 8 },
  inlineRetryText: { color: '#991b1b', fontWeight: '700' },
});
