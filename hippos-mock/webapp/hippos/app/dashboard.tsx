import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { View, Text } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryTheme } from 'victory-native';
import { getHistory, getLatestProcessed, type ProcessedPoint } from '@/lib/api';

function DividerWithLabel({ label }: { label: string }) {
  return (
    <View style={{ width: '100%', alignItems: 'center', marginVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        <Text style={{ marginHorizontal: 8, color: '#333', fontWeight: '600', letterSpacing: 1 }}>{label}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
      </View>
    </View>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          backgroundColor: '#F2B24D',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
          elevation: 3,
          minWidth: 140,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontWeight: '700', color: '#000' }}>{title}</Text>
      </View>
      <View
        style={{
          backgroundColor: 'white',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
          elevation: 3,
          minWidth: 140,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: '600', color: '#111' }}>{value}</Text>
      </View>
    </View>
  );
}

export default function Dashboard() {
  const [live, setLive] = useState<ProcessedPoint | null>(null);
  const [history, setHistory] = useState<ProcessedPoint[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [h, l] = await Promise.all([getHistory(), getLatestProcessed()]);
      if (!mounted) return;
      setHistory(h.slice(-50));
      if (l) setLive(l);
    })();
    // live polling
    pollRef.current = setInterval(async () => {
      const l = await getLatestProcessed();
      if (l) {
        setLive(l);
        setHistory((prev) => [...prev.slice(-49), l]);
      }
    }, 1000);
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const time = useMemo(() => {
    const t = live?.timestamp ?? Date.now() / 1000;
    return new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [live?.timestamp]);
  const liveAngle = live?.combined_average != null ? `${Math.round(live.combined_average)}°` : '—';

  return (
    <LinearGradient
      colors={["#2F2F2F", "#6A6A6A"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, paddingTop: 24, paddingHorizontal: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Image source={require('@/assets/images/hippos_icon.png')} style={{ width: 28, height: 28, borderRadius: 14 }} />
          <Text style={{ marginLeft: 8, fontSize: 18, letterSpacing: 3, fontWeight: '700', color: '#EDEDED' }}>DASHBOARD</Text>
        </View>

        {/* 3D Knee Model */}
        <Text style={{ color: '#EDEDED', textAlign: 'center', marginTop: 8, marginBottom: 6 }}>3D Knee Model</Text>
        <View style={{ alignItems: 'center' }}>
          <Image source={require('@/assets/images/knee_model.png')} style={{ width: 140, height: 180, resizeMode: 'contain' }} />
        </View>

        <DividerWithLabel label="LIVE ANGLE" />

        <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 8, marginHorizontal: 8, marginBottom: 12 }}>
          <VictoryChart height={180} theme={VictoryTheme.material} padding={{ top: 12, bottom: 40, left: 40, right: 12 }}>
            <VictoryAxis
              dependentAxis
              tickFormat={(t) => `${Math.round(t)}`}
              style={{
                axis: { stroke: 'rgba(0,0,0,0.5)' },
                tickLabels: { fill: '#EDEDED', fontSize: 10 },
                grid: { stroke: 'rgba(255,255,255,0.05)' },
              }}
            />
            <VictoryAxis
              tickFormat={() => ''}
              style={{ axis: { stroke: 'rgba(0,0,0,0.5)' }, tickLabels: { fill: 'transparent' } }}
            />
            <VictoryLine
              interpolation="monotoneX"
              style={{ data: { stroke: '#F2B24D', strokeWidth: 3 } }}
              data={history.map((p, i) => ({ x: i, y: p.combined_average }))}
            />
          </VictoryChart>
        </View>

        {/* Stat cards */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 8 }}>
          <StatCard title="Time Stamp" value={time} />
          <StatCard title="Live Angle" value={liveAngle} />
        </View>
      </View>
    </LinearGradient>
  );
}
