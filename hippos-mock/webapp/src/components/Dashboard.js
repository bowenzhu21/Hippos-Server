import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Heading,
  Container,
  VStack,
  Code,
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
  Tooltip,
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
  Tooltip,
  Legend
);

const URL_HISTORY = "http://localhost:5050/history";
const URL_LATEST_RAW = "http://localhost:5050/latest_raw";

/** Hippos-ish palette */
const palette = {
  bgGradFrom: "#F1F2F6", // light grey
  bgGradTo:   "#D9DBE1", // slightly darker grey
  charcoal:   "#1F2430", // headings / text
  slate:      "#404754", // secondary text / grid
  cardFrom:   "#F7F8FB", // card gradient top
  cardTo:     "#E9EBF2", // card gradient bottom
  border:     "#C9CED8",
  mint:       "#9AD0B3", // primary accent (buttons/lines)
  lavender:   "#B7B3D9", // secondary accent
  white:      "#FFFFFF",
};

const Dashboard = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [processedData, setProcessedData] = useState("Loading...");
  const [rawData, setRawData] = useState("Loading...");
  const [startTime, setStartTime] = useState(Date.now());

  // Extract the latest angle from processedData (safe fallback to 0)
  let angleDeg = 0;
  try {
    const parsed = JSON.parse(processedData);
    angleDeg = Number(parsed.combined_average) || 0;
  } catch {
    angleDeg = 0;
  }

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
            backgroundColor: "rgba(154, 208, 179, 0.15)", // mint with alpha
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
            title: { display: true, text: "Combined Average", color: palette.slate },
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

        <Heading size="lg" color={palette.charcoal}>
          Knee Brace Data Dashboard
        </Heading>

        {/* Knee Model */}
        <Box w="100%">
          <Heading size="md" mb={3} color={palette.charcoal}>
            3D Knee Model
          </Heading>
          <KneeModel3D angleDeg={angleDeg} />
        </Box>

        {/* Processed JSON */}
        <Box
          w="100%"
          p={0}
          borderRadius="lg"
          sx={{
            background: `linear-gradient(180deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
            border: `1px solid ${palette.border}`,
          }}
        >
          <Heading size="md" p={4} color={palette.charcoal}>
            Processed Data
          </Heading>
          <Code
            p={4}
            w="100%"
            display="block"
            borderRadius="0 0 12px 12px"
            whiteSpace="pre-wrap"
            sx={{
              bg: "#22262A",
              color: "#EDF2F7",
              borderTop: `1px solid ${palette.border}`,
            }}
          >
            {processedData}
          </Code>
        </Box>

        {/* Chart */}
        <Box
          w="100%"
          p={0}
          borderRadius="lg"
          sx={{
            background: `linear-gradient(180deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
            border: `1px solid ${palette.border}`,
          }}
        >
          <Heading size="md" p={4} color={palette.charcoal}>
            Knee Angle Live Graph
          </Heading>
          <Box h="260px" p={3} bg={palette.white} borderRadius="0 0 12px 12px">
            <canvas ref={chartRef}></canvas>
          </Box>
        </Box>

        {/* Raw JSON */}
        <Box
          w="100%"
          p={0}
          borderRadius="lg"
          sx={{
            background: `linear-gradient(180deg, ${palette.cardFrom} 0%, ${palette.cardTo} 100%)`,
            border: `1px solid ${palette.border}`,
          }}
        >
          {/*
          <Heading size="md" p={4} color={palette.charcoal}>
            Raw Data (For Ursula)
          </Heading>
          <Code
            p={4}
            w="100%"
            display="block"
            borderRadius="0 0 12px 12px"
            whiteSpace="pre-wrap"
            sx={{
              bg: "#22262A",
              color: "#EDF2F7",
              borderTop: `1px solid ${palette.border}`,
            }}
          >
            {rawData}
          </Code>
          */}
        </Box>
      </VStack>
    </Container>
  );
};

export default Dashboard;
