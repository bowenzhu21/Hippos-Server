import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { TouchableOpacity, View, Text } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryTheme } from 'victory-native';
import { DualHX1 } from '@/lib/bleDual';

type HistoryPoint = { ts: number; angle: number };

export default function Dashboard() {
  const [status, setStatus] = useState('idle');
  const [angle, setAngle] = useState<number | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<DualHX1 | null>(null);

  useEffect(() => () => {
    managerRef.current?.destroy();
    managerRef.current = null;
  }, []);

  const handleUpdate = useCallback((update: { status: string; angle?: number | null; calibrated?: boolean; error?: string }) => {
    if (update.status) setStatus(update.status);
    if (typeof update.calibrated === 'boolean') setCalibrated(update.calibrated);

    if (update.error) {
      setError(update.error);
      console.warn(update.error);
    } else if (update.status !== 'error') {
      setError(null);
    }

    if (typeof update.angle === 'number') {
      const nextAngle = update.angle;
      setAngle(nextAngle);
      setHistory((prev) => [...prev.slice(-49), { ts: Date.now(), angle: nextAngle }]);
    } else if (update.angle === null) {
      setAngle(null);
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    setAngle(null);
    setCalibrated(false);
    setHistory([]);

    managerRef.current?.destroy();
    const manager = new DualHX1(handleUpdate);
    managerRef.current = manager;

    try {
      await manager.connectTwo();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setError(message);
      console.warn(message);
    }
  }, [handleUpdate]);

  const lastTimestamp = history.length ? history[history.length - 1].ts : null;
  const timeLabel = useMemo(() => {
    if (!lastTimestamp) return '—';
    return new Date(lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastTimestamp]);

  const liveAngle = calibrated && typeof angle === 'number' ? `${angle.toFixed(1)}°` : '—';

  return (
    <LinearGradient
      colors={["#2F2F2F", "#6A6A6A"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1 }}
    >
      <View style={{ flex: 1, paddingTop: 24, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Image
            source={require('@/assets/images/hippos_icon.png')}
            style={{ width: 28, height: 28, borderRadius: 14 }}
            contentFit="cover"
          />
          <Text style={{ marginLeft: 8, fontSize: 18, letterSpacing: 3, fontWeight: '700', color: '#EDEDED' }}>DASHBOARD</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          <TouchableOpacity
            onPress={start}
            style={{
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: '#F2B24D',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.2,
              shadowRadius: 6,
              elevation: 3,
            }}
          >
            <Text style={{ fontWeight: '700', color: '#000' }}>Connect 2×HX1</Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, color: '#EDEDED', fontWeight: '500' }}>Status: {status}</Text>
          <Text style={{ marginTop: 4, color: '#EDEDED' }}>
            {calibrated ? `Angle: ${liveAngle}` : 'Calibrating… keep sensors steady'}
          </Text>
          {error ? <Text style={{ marginTop: 4, color: '#FF6B6B' }}>{error}</Text> : null}
        </View>

        <Text style={{ color: '#EDEDED', textAlign: 'center', marginTop: 8, marginBottom: 6 }}>3D Knee Model</Text>
        <View style={{ alignItems: 'center' }}>
          <Image
            source={require('@/assets/images/knee_model.png')}
            style={{ width: 140, height: 180 }}
            contentFit="contain"
          />
        </View>

        <View style={{ width: '100%', alignItems: 'center', marginVertical: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
            <Text style={{ marginHorizontal: 8, color: '#333', fontWeight: '600', letterSpacing: 1 }}>LIVE ANGLE</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
          </View>
        </View>

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
              data={history.map((p, i) => ({ x: i, y: p.angle }))}
            />
          </VictoryChart>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 8 }}>
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
              <Text style={{ fontWeight: '700', color: '#000' }}>Time Stamp</Text>
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
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#111' }}>{timeLabel}</Text>
            </View>
          </View>
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
              <Text style={{ fontWeight: '700', color: '#000' }}>Live Angle</Text>
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
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#111' }}>{liveAngle}</Text>
            </View>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}
