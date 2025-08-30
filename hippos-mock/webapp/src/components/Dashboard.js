import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Heading,
  Container,
  VStack,
  Text,
  SimpleGrid,
} from "@chakra-ui/react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Filler,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import KneeModel3D from "./KneeModel3D";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale,
  Filler,
  ChartTooltip,
  Legend
);

const URL_HISTORY = "http://localhost:5050/history";
const URL_LATEST_RAW = "http://localhost:5050/latest_raw";

/** Hippos-ish palette */
const palette = {
  bgGradFrom: "#F1F2F6",
  bgGradTo: "#D9DBE1",
  charcoal: "#1F2430",
  slate: "#404754",
  cardFrom: "#F7F8FB",
  cardTo: "#E9EBF2",
  border: "#C9CED8",
  mint: "#9AD0B3",
  lavender: "#B7B3D9",
  white: "#FFFFFF",
};

const Dashboard = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [processedData, setProcessedData] = useState("Loading...");
  const [rawData, setRawData] = useState("Loading...");
  const [startTime, setStartTime] = useState(Date.now());
  // Add state for tooltip visibility
  const [showTip, setShowTip] = useState(false);

  // Extract angle safely
  let angleDeg = 0;
  try {
    const parsed = JSON.parse(processedData);
    angleDeg = Number(parsed.combined_average) || 0;
  } catch {
    angleDeg = 0;
  }

  // Prepare latest reading
  const latestReading = (() => {
    try {
      const obj = JSON.parse(processedData);
      const ts =
        typeof obj.timestamp === "number" ? obj.timestamp : Date.now() / 1000;
      const angle = Number(obj.combined_average) || 0;
      return {
        timestamp: ts,
        angle,
        formatted: new Date(ts * 1000).toLocaleString(),
      };
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!chartRef.current) return;
    const ctx = chartRef.current.getContext("2d");

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Combined Average",
            data: [],
            borderColor: palette.mint,
            backgroundColor: "rgba(154, 208, 179, 0.15)",
            borderWidth: 3,
            fill: true,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: palette.slate },
          },
          tooltip: {
            backgroundColor: palette.charcoal,
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: palette.border,
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Time (s)", color: palette.slate },
            ticks: { color: palette.slate, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: "#E2E5EC" },
          },
          y: {
            title: {
              display: true,
              text: "Combined Average",
              color: palette.slate,
            },
            ticks: { color: palette.slate },
            grid: { color: "#E2E5EC" },
            beginAtZero: false,
          },
        },
      },
    });

    fetchAndDrawHistory();
    const interval = setInterval(fetchAndDrawHistory, 500);
    return () => {
      clearInterval(interval);
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
    // eslint-disable-next-line
  }, []);

  const fetchAndDrawHistory = async () => {
    try {
      const res = await fetch(URL_HISTORY);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        chartInstance.current.data.labels = [];
        chartInstance.current.data.datasets[0].data = [];

        const baseTime = data[0].timestamp;
        setStartTime(baseTime * 1000);

        for (const entry of data) {
          const combined = Number(entry.combined_average);
          if (Number.isNaN(combined)) continue;
          const relTime = (entry.timestamp - baseTime).toFixed(1);
          chartInstance.current.data.labels.push(relTime);
          chartInstance.current.data.datasets[0].data.push(combined);
        }
        chartInstance.current.update();

        const latest = data[data.length - 1];
        setProcessedData(JSON.stringify(latest, null, 2));
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    }

    try {
      const rawRes = await fetch(URL_LATEST_RAW);
      const raw = await rawRes.json();
      setRawData(JSON.stringify(raw, null, 2));
    } catch (err) {
      setRawData("Error fetching raw data");
    }
  };

  return (
    <Container
      maxW="container.xl"
      py={8}
      sx={{
        background: `linear-gradient(180deg, ${palette.bgGradFrom} 0%, ${palette.bgGradTo} 100%)`,
        borderRadius: 16,
        boxShadow: "sm",
      }}
    >
      <VStack spacing={8} align="start">
        <Heading
          size="lg"
          color={palette.charcoal}
          w="100%"
          textAlign="center"
          mb={6}
        >
          Knee Brace Data Dashboard
        </Heading>

        {/* Knee Model */}
        <Box
          w="100%"
          borderRadius="2xl"
          border={`2px solid ${palette.border}`}
          boxShadow="md"
          p={4}
          bg={palette.white}
        >
          <Heading size="md" mb={3} color={palette.charcoal}>
            3D Knee Model
          </Heading>
          <KneeModel3D angleDeg={angleDeg} />
        </Box>

        {/* Latest Reading Card */}
        <Box
          w="100%"
          borderRadius="2xl"
          border={`2px solid ${palette.border}`}
          boxShadow="md"
          sx={{
            background: `linear-gradient(180deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
          }}
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            p={4}
            position="relative"
          >
            <Heading size="md" color={palette.charcoal}>
              Latest Reading
            </Heading>

            {/* Tooltip Button */}
            <Box position="relative" display="inline-block">
              <Box
                as="button"
                aria-label="Angle description"
                w="28px"
                h="28px"
                borderRadius="full"
                border={`1px solid ${palette.border}`}
                bg={palette.white}
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontWeight="bold"
                color={palette.slate}
                onMouseEnter={() => setShowTip(true)}
                onMouseLeave={() => setShowTip(false)}
                _hover={{ bg: palette.cardFrom }}
              >
                ?
              </Box>

              {/* Tooltip bubble */}
              {showTip && (
                <Box
                  position="absolute"
                  top="50%"
                  right="40px"
                  transform="translateY(-50%)"
                  px={3}
                  py={2}
                  bg={palette.charcoal}
                  color="white"
                  fontSize="sm"
                  borderRadius="md"
                  border={`1px solid ${palette.border}`}
                  whiteSpace="nowrap"
                  zIndex={9999}
                  boxShadow="md"
                >
                  angle description
                </Box>
              )}
            </Box>
          </Box>

          <Box px={6} pb={5}>
            {latestReading ? (
              <SimpleGrid columns={[1, 2]} spacing={6}>
                <Box
                  p={4}
                  borderRadius="lg"
                  bg={palette.white}
                  border={`1px solid ${palette.border}`}
                >
                  <Text fontSize="sm" color={palette.slate} mb={1}>
                    Timestamp
                  </Text>
                  <Text
                    fontSize="lg"
                    fontWeight="semibold"
                    color={palette.charcoal}
                  >
                    {latestReading.formatted}
                  </Text>
                </Box>

                <Box
                  p={4}
                  borderRadius="lg"
                  bg={palette.white}
                  border={`1px solid ${palette.border}`}
                >
                  <Text fontSize="sm" color={palette.slate} mb={1}>
                    Angle
                  </Text>
                  <Text
                    fontSize="2xl"
                    fontWeight="bold"
                    color={palette.charcoal}
                  >
                    {latestReading.angle.toFixed(1)}°
                  </Text>
                </Box>
              </SimpleGrid>
            ) : (
              <Text color={palette.slate}>Waiting for data…</Text>
            )}
          </Box>
        </Box>

        {/* Chart */}
        <Box
          w="100%"
          borderRadius="2xl"
          border={`2px solid ${palette.border}`}
          boxShadow="md"
          p={0}
          sx={{
            background: `linear-gradient(180deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
          }}
        >
          <Heading size="md" p={4} color={palette.charcoal}>
            Knee Angle Live Graph
          </Heading>
          <Box h="260px" p={3} bg={palette.white} borderRadius="0 0 20px 20px">
            <canvas ref={chartRef}></canvas>
          </Box>
        </Box>
      </VStack>
    </Container>
  );
};

export default Dashboard;