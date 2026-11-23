import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Compass,
  Globe,
  Sparkles,
  Box,
  Dna,
  Disc,
  Car,
  TrendingUp,
  Building2,
  Zap,
  Server,
  Package,
  FolderOpen,
  Loader2,
  HeartPulse,
} from "lucide-react";

export type Model3DType =
  | "globe"
  | "crystal"
  | "medical"
  | "dna"
  | "torus"
  | "automotive"
  | "finance"
  | "city"
  | "energy"
  | "server"
  | "logistics"
  | "custom";

interface Interactive3DViewerProps {
  modelType?: Model3DType;
  modelUrl?: string;
  accentColor?: string;
  autoRotateSpeed?: number;
  interactive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onModelChange?: (type: Model3DType) => void;
}

export const Interactive3DViewer: React.FC<Interactive3DViewerProps> = ({
  modelType = "globe",
  modelUrl,
  accentColor = "#38BDF8",
  autoRotateSpeed = 0.004,
  interactive = true,
  className = "",
  style = {},
  onModelChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [currentModel, setCurrentModel] = useState<Model3DType>(modelType);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  // Sync prop changes
  useEffect(() => {
    setCurrentModel(modelType);
  }, [modelType]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 240;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      // No WebGL (old device, disabled GPU, blocked context): show a notice instead of crashing (D1 item 11).
      setWebglUnavailable(true);
      return;
    }
    setWebglUnavailable(false);
    renderer.setSize(width, height);
    // Pixel-density cap (D1 item 6): phones render at most 1.5x, other screens 2x.
    const isPhone = window.matchMedia?.("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Root group to hold objects and handle rotation
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(100, 150, 150);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(new THREE.Color(accentColor), 1.5);
    dirLight2.position.set(-100, -100, -100);
    scene.add(dirLight2);

    // Build model geometry based on currentModel
    const cleanups: (() => void)[] = [];
    const perFrameUpdates: ((time: number) => void)[] = [];

    if (currentModel === "globe") {
      // ----------------------------------------------------
      // 1. PROCEDURAL 3D EARTH GLOBE WITH ATMOSPHERE & ARCS
      // ----------------------------------------------------
      const globeRadius = 75;

      // Inner Dark Ocean Sphere
      const oceanGeo = new THREE.SphereGeometry(globeRadius, 48, 48);
      const oceanMat = new THREE.MeshPhongMaterial({
        color: 0x060c18,
        emissive: 0x030712,
        specular: 0x1e3a8a,
        shininess: 25,
        transparent: true,
        opacity: 0.95,
      });
      const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
      rootGroup.add(oceanMesh);

      // Lat/Long Wireframe Sphere Grid
      const gridGeo = new THREE.SphereGeometry(globeRadius + 0.3, 24, 18);
      const gridMat = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        wireframe: true,
        transparent: true,
        opacity: 0.35,
      });
      const gridMesh = new THREE.Mesh(gridGeo, gridMat);
      rootGroup.add(gridMesh);

      // Continental Landmass Particles Matrix
      const dotCount = 2400;
      const dotPositions = new Float32Array(dotCount * 3);
      const dotColors = new Float32Array(dotCount * 3);
      const colorPrimary = new THREE.Color(accentColor);
      const colorSecondary = new THREE.Color(0xa855f7);

      for (let i = 0; i < dotCount; i++) {
        // Distribute points on sphere using fibonacci spiral
        const phi = Math.acos(-1 + (2 * i) / dotCount);
        const theta = Math.sqrt(dotCount * Math.PI) * phi;

        const x = globeRadius * 1.01 * Math.cos(theta) * Math.sin(phi);
        const y = globeRadius * 1.01 * Math.sin(theta) * Math.sin(phi);
        const z = globeRadius * 1.01 * Math.cos(phi);

        dotPositions[i * 3] = x;
        dotPositions[i * 3 + 1] = y;
        dotPositions[i * 3 + 2] = z;

        const mixedColor = colorPrimary.clone().lerp(colorSecondary, Math.sin(phi) * 0.5 + 0.5);
        dotColors[i * 3] = mixedColor.r;
        dotColors[i * 3 + 1] = mixedColor.g;
        dotColors[i * 3 + 2] = mixedColor.b;
      }

      const dotsGeo = new THREE.BufferGeometry();
      dotsGeo.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));
      dotsGeo.setAttribute("color", new THREE.BufferAttribute(dotColors, 3));

      // Circular canvas texture for smooth dots
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
      }
      const dotTexture = new THREE.CanvasTexture(canvas);

      const dotsMat = new THREE.PointsMaterial({
        size: 3.2,
        map: dotTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const dotsMesh = new THREE.Points(dotsGeo, dotsMat);
      rootGroup.add(dotsMesh);

      // Glowing Atmosphere Shell
      const atmoGeo = new THREE.SphereGeometry(globeRadius * 1.15, 32, 32);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentColor),
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      rootGroup.add(atmoMesh);

      // Glowing Orbiting Ring with Particle Satellites
      const ringGeo = new THREE.RingGeometry(globeRadius * 1.32, globeRadius * 1.34, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 3;
      ringMesh.rotation.y = Math.PI / 6;
      rootGroup.add(ringMesh);

      // Data Hotspots (Hubs) on Globe
      const hubs = [
        { lat: 37.77, lon: -122.41 }, // SF
        { lat: 51.5, lon: -0.12 }, // London
        { lat: 35.67, lon: 139.65 }, // Tokyo
        { lat: 40.71, lon: -74.0 }, // NYC
        { lat: 1.35, lon: 103.81 }, // Singapore
        { lat: 25.2, lon: 55.27 }, // Dubai
      ];

      const hubGroup = new THREE.Group();
      hubs.forEach((h) => {
        const phi = (90 - h.lat) * (Math.PI / 180);
        const theta = (h.lon + 180) * (Math.PI / 180);
        const r = globeRadius * 1.02;

        const x = -r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);

        // Pulsing Beacon
        const beaconGeo = new THREE.SphereGeometry(2, 16, 16);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.set(x, y, z);
        hubGroup.add(beacon);

        // Beacon Halo
        const haloGeo = new THREE.RingGeometry(2.5, 4.5, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.set(x, y, z);
        halo.lookAt(0, 0, 0);
        hubGroup.add(halo);
      });
      rootGroup.add(hubGroup);

      // Arcs connecting hubs
      for (let i = 0; i < hubs.length; i++) {
        const next = (i + 1) % hubs.length;
        const h1 = hubs[i];
        const h2 = hubs[next];

        const phi1 = (90 - h1.lat) * (Math.PI / 180);
        const theta1 = (h1.lon + 180) * (Math.PI / 180);
        const p1 = new THREE.Vector3(
          -globeRadius * Math.sin(phi1) * Math.cos(theta1),
          globeRadius * Math.cos(phi1),
          globeRadius * Math.sin(phi1) * Math.sin(theta1)
        );

        const phi2 = (90 - h2.lat) * (Math.PI / 180);
        const theta2 = (h2.lon + 180) * (Math.PI / 180);
        const p2 = new THREE.Vector3(
          -globeRadius * Math.sin(phi2) * Math.cos(theta2),
          globeRadius * Math.cos(phi2),
          globeRadius * Math.sin(phi2) * Math.sin(theta2)
        );

        // Midpoint pushed outward
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        mid.normalize().multiplyScalar(globeRadius * 1.35);

        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const points = curve.getPoints(30);
        const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
        const arcMat = new THREE.LineBasicMaterial({
          color: 0x60a5fa,
          transparent: true,
          opacity: 0.5,
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        rootGroup.add(arcLine);
      }
    } else if (currentModel === "crystal") {
      // ----------------------------------------------------
      // 2. 3D HOLOGRAPHIC TECH CRYSTAL / ISOMETRIC PRISM
      // ----------------------------------------------------
      const crystalGeo = new THREE.IcosahedronGeometry(60, 0);
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(accentColor),
        emissive: 0x1e1b4b,
        roughness: 0.1,
        metalness: 0.2,
        transmission: 0.8,
        ior: 1.5,
        transparent: true,
        opacity: 0.85,
      });
      const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
      rootGroup.add(crystalMesh);

      // Wireframe overlay
      const wireGeo = new THREE.WireframeGeometry(crystalGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.8,
      });
      const wireLine = new THREE.LineSegments(wireGeo, wireMat);
      rootGroup.add(wireLine);

      // Inner pulsing nucleus
      const coreGeo = new THREE.OctahedronGeometry(28, 0);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        wireframe: true,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      rootGroup.add(coreMesh);

      // Floating Particle Cloud
      const partCount = 400;
      const partPos = new Float32Array(partCount * 3);
      for (let i = 0; i < partCount * 3; i += 3) {
        partPos[i] = (Math.random() - 0.5) * 160;
        partPos[i + 1] = (Math.random() - 0.5) * 160;
        partPos[i + 2] = (Math.random() - 0.5) * 160;
      }
      const partGeo = new THREE.BufferGeometry();
      partGeo.setAttribute("position", new THREE.BufferAttribute(partPos, 3));
      const partMat = new THREE.PointsMaterial({
        size: 3,
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });
      const partCloud = new THREE.Points(partGeo, partMat);
      rootGroup.add(partCloud);
    } else if (currentModel === "dna") {
      // ----------------------------------------------------
      // 3. 3D DNA DOUBLE HELIX & MOLECULAR STRAND
      // ----------------------------------------------------
      const numNodes = 40;
      const helixRadius = 38;
      const helixHeight = 160;

      const sphereGeo = new THREE.SphereGeometry(3.5, 16, 16);
      const blueMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        roughness: 0.3,
        metalness: 0.8,
      });
      const purpleMat = new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x7e22ce,
        roughness: 0.3,
        metalness: 0.8,
      });

      for (let i = 0; i < numNodes; i++) {
        const t = (i / numNodes) * Math.PI * 4;
        const y = (i / numNodes) * helixHeight - helixHeight / 2;

        const x1 = helixRadius * Math.cos(t);
        const z1 = helixRadius * Math.sin(t);

        const x2 = helixRadius * Math.cos(t + Math.PI);
        const z2 = helixRadius * Math.sin(t + Math.PI);

        // Strand 1 Node
        const n1 = new THREE.Mesh(sphereGeo, blueMat);
        n1.position.set(x1, y, z1);
        rootGroup.add(n1);

        // Strand 2 Node
        const n2 = new THREE.Mesh(sphereGeo, purpleMat);
        n2.position.set(x2, y, z2);
        rootGroup.add(n2);

        // Rung connecting them every step
        const rungPoints = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
        const rungGeo = new THREE.BufferGeometry().setFromPoints(rungPoints);
        const rungMat = new THREE.LineBasicMaterial({
          color: 0x64748b,
          transparent: true,
          opacity: 0.6,
        });
        const rung = new THREE.Line(rungGeo, rungMat);
        rootGroup.add(rung);
      }
    } else if (currentModel === "torus") {
      // ----------------------------------------------------
      // 4. 3D CYBER TORUS / QUANTUM GYROSCOPE
      // ----------------------------------------------------
      const torusGeo = new THREE.TorusGeometry(55, 14, 16, 60);
      const torusMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentColor),
        roughness: 0.2,
        metalness: 0.8,
      });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      rootGroup.add(torus);

      const torusWire = new THREE.Mesh(
        torusGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 })
      );
      rootGroup.add(torusWire);

      // Inner Ring
      const ring2Geo = new THREE.TorusGeometry(32, 6, 16, 40);
      const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true });
      const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
      ring2.rotation.x = Math.PI / 2;
      rootGroup.add(ring2);

      // Core glowing plasma
      const coreSphere = new THREE.Mesh(
        new THREE.SphereGeometry(16, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      rootGroup.add(coreSphere);
    } else if (currentModel === "automotive") {
      // ----------------------------------------------------
      // 5. 3D AUTOMOTIVE / CYBER EV CHASSIS & MOBILITY
      // ----------------------------------------------------
      const bodyGeo = new THREE.BoxGeometry(64, 14, 126);
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(accentColor),
        metalness: 0.85,
        roughness: 0.2,
        clearcoat: 1.0,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = 8;
      rootGroup.add(bodyMesh);

      // Sleek cockpit / aerodynamic cabin
      const cabinGeo = new THREE.BoxGeometry(44, 16, 68);
      const cabinMat = new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.85,
        transparent: true,
        opacity: 0.9,
      });
      const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
      cabinMesh.position.set(0, 22, -6);
      rootGroup.add(cabinMesh);

      // Chassis wireframe overlay for blueprint aesthetic
      const wireGeo = new THREE.WireframeGeometry(bodyGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
      });
      const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
      wireMesh.position.y = 8;
      rootGroup.add(wireMesh);

      // 4 Cyber Wheels with glowing rim rings
      const wheelGeo = new THREE.CylinderGeometry(11, 11, 8, 24);
      wheelGeo.rotateZ(Math.PI / 2);
      const tireMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.6,
        metalness: 0.4,
      });
      const rimMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentColor),
      });

      const wheelPositions: [number, number, number][] = [
        [-34, 4, 38],
        [34, 4, 38],
        [-34, 4, -38],
        [34, 4, -38],
      ];

      wheelPositions.forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.position.set(wx, wy, wz);
        rootGroup.add(wheel);

        const rimRingGeo = new THREE.RingGeometry(6, 9, 20);
        rimRingGeo.rotateY(Math.PI / 2);
        const rimRing = new THREE.Mesh(rimRingGeo, rimMat);
        rimRing.position.set(wx > 0 ? wx + 4.1 : wx - 4.1, wy, wz);
        rootGroup.add(rimRing);
      });

      // Front Cyber LED Headlight Bar
      const headLightGeo = new THREE.BoxGeometry(50, 3, 2);
      const headLightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const headLight = new THREE.Mesh(headLightGeo, headLightMat);
      headLight.position.set(0, 11, 63.5);
      rootGroup.add(headLight);

      // Rear Full-Width Taillight Blade (crimson glow)
      const tailLightGeo = new THREE.BoxGeometry(52, 3, 2);
      const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const tailLight = new THREE.Mesh(tailLightGeo, tailLightMat);
      tailLight.position.set(0, 12, -63.5);
      rootGroup.add(tailLight);

      // Holographic floor grid under vehicle
      const floorGrid = new THREE.GridHelper(180, 18, 0x38bdf8, 0x1e293b);
      floorGrid.position.y = -6;
      rootGroup.add(floorGrid);

      // Trailing aerodynamic speed stream particles
      const streamCount = 180;
      const streamPos = new Float32Array(streamCount * 3);
      for (let i = 0; i < streamCount * 3; i += 3) {
        streamPos[i] = (Math.random() - 0.5) * 60;
        streamPos[i + 1] = Math.random() * 25 + 2;
        streamPos[i + 2] = -Math.random() * 100 - 20;
      }
      const streamGeo = new THREE.BufferGeometry();
      streamGeo.setAttribute("position", new THREE.BufferAttribute(streamPos, 3));
      const streamMat = new THREE.PointsMaterial({
        size: 2.2,
        color: new THREE.Color(accentColor),
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });
      const streamMesh = new THREE.Points(streamGeo, streamMat);
      rootGroup.add(streamMesh);
    } else if (currentModel === "finance") {
      // ----------------------------------------------------
      // 6. 3D FINTECH / WEALTH, VALUATION & CAPITAL GROWTH
      // ----------------------------------------------------
      // Central floating 3D Token / Vault Core
      const coinGeo = new THREE.CylinderGeometry(36, 36, 7, 36);
      const coinMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.85,
        roughness: 0.2,
      });
      const coinMesh = new THREE.Mesh(coinGeo, coinMat);
      coinMesh.rotation.x = Math.PI / 4;
      coinMesh.position.set(0, 15, 0);
      rootGroup.add(coinMesh);

      // Embossed inner neon ring on coin
      const coinRingGeo = new THREE.TorusGeometry(26, 2, 16, 36);
      const coinRingMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const coinRing = new THREE.Mesh(coinRingGeo, coinRingMat);
      coinRing.rotation.x = Math.PI / 4;
      coinRing.position.set(0, 15, 0);
      rootGroup.add(coinRing);

      // Rising 3D Financial Growth Columns (5 ascending isometric pillars)
      const barHeights = [28, 44, 62, 85, 115];
      const startX = -65;
      const stepX = 32;

      barHeights.forEach((h, idx) => {
        const barGeo = new THREE.BoxGeometry(18, h, 18);
        const isLatest = idx === barHeights.length - 1;
        const barMat = new THREE.MeshPhysicalMaterial({
          color: isLatest ? new THREE.Color(accentColor) : 0x10b981,
          metalness: 0.4,
          roughness: 0.2,
          transparent: true,
          opacity: 0.85,
        });
        const barMesh = new THREE.Mesh(barGeo, barMat);
        barMesh.position.set(startX + idx * stepX, -50 + h / 2, -15 - idx * 6);
        rootGroup.add(barMesh);

        // Glowing cap on each bar
        const capGeo = new THREE.BoxGeometry(18.5, 2.5, 18.5);
        const capMat = new THREE.MeshBasicMaterial({
          color: isLatest ? 0x38bdf8 : 0x34d399,
        });
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.set(startX + idx * stepX, -50 + h + 1.25, -15 - idx * 6);
        rootGroup.add(capMesh);
      });

      // Growth Trend Arrow / Beam
      const trendPoints = barHeights.map((h, idx) =>
        new THREE.Vector3(startX + idx * stepX, -50 + h + 10, -15 - idx * 6)
      );
      const trendCurve = new THREE.CatmullRomCurve3(trendPoints);
      const trendGeo = new THREE.TubeGeometry(trendCurve, 40, 2.2, 12, false);
      const trendMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
      });
      const trendMesh = new THREE.Mesh(trendGeo, trendMat);
      rootGroup.add(trendMesh);

      // Dual holographic orbital rings around coin
      const orbitGeo = new THREE.TorusGeometry(62, 1.2, 16, 60);
      const orbitMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.5,
      });
      const orbit1 = new THREE.Mesh(orbitGeo, orbitMat);
      orbit1.rotation.x = Math.PI / 3;
      orbit1.position.y = 15;
      rootGroup.add(orbit1);

      const orbit2 = new THREE.Mesh(orbitGeo, orbitMat);
      orbit2.rotation.y = Math.PI / 3;
      orbit2.rotation.x = -Math.PI / 6;
      orbit2.position.y = 15;
      rootGroup.add(orbit2);
    } else if (currentModel === "city") {
      // ----------------------------------------------------
      // 7. 3D SMART CITY / REAL ESTATE & ARCHITECTURE
      // ----------------------------------------------------
      const buildings = [
        { x: -35, z: -35, w: 24, d: 24, h: 90, col: 0x1e3a8a, top: 0x38bdf8 },
        { x: 0,   z: -30, w: 28, d: 28, h: 140, col: 0x0f172a, top: 0x60a5fa, spire: 30 },
        { x: 35,  z: -25, w: 22, d: 22, h: 105, col: 0x1e293b, top: 0x38bdf8 },
        { x: -40, z: 15,  w: 26, d: 26, h: 70,  col: 0x1e293b, top: 0xa855f7 },
        { x: -5,  z: 15,  w: 24, d: 34, h: 110, col: 0x1e3a8a, top: 0x38bdf8, spire: 20 },
        { x: 35,  z: 20,  w: 20, d: 20, h: 80,  col: 0x0f172a, top: 0x38bdf8 },
        { x: -10, z: 50,  w: 28, d: 20, h: 55,  col: 0x1e293b, top: 0x60a5fa },
        { x: 25,  z: 50,  w: 22, d: 22, h: 65,  col: 0x1e3a8a, top: 0x38bdf8 },
      ];

      buildings.forEach((b) => {
        const bGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
        const bMat = new THREE.MeshPhysicalMaterial({
          color: b.col,
          metalness: 0.6,
          roughness: 0.2,
          transparent: true,
          opacity: 0.88,
        });
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.set(b.x, -50 + b.h / 2, b.z);
        rootGroup.add(bMesh);

        const wireGeo = new THREE.WireframeGeometry(bGeo);
        const wireMat = new THREE.LineBasicMaterial({
          color: b.top,
          transparent: true,
          opacity: 0.45,
        });
        const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
        wireMesh.position.set(b.x, -50 + b.h / 2, b.z);
        rootGroup.add(wireMesh);

        const roofGeo = new THREE.BoxGeometry(b.w * 0.9, 2, b.d * 0.9);
        const roofMat = new THREE.MeshBasicMaterial({ color: b.top });
        const roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(b.x, -50 + b.h + 1, b.z);
        rootGroup.add(roofMesh);

        if (b.spire) {
          const spireGeo = new THREE.CylinderGeometry(0.8, 1.8, b.spire, 12);
          const spireMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
          const spireMesh = new THREE.Mesh(spireGeo, spireMat);
          spireMesh.position.set(b.x, -50 + b.h + b.spire / 2, b.z);
          rootGroup.add(spireMesh);

          const beaconGeo = new THREE.SphereGeometry(2.5, 12, 12);
          const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
          const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
          beaconMesh.position.set(b.x, -50 + b.h + b.spire + 1, b.z);
          rootGroup.add(beaconMesh);
        }
      });

      // Elevated skybridge connecting towers
      const bridgeGeo = new THREE.BoxGeometry(32, 6, 8);
      const bridgeMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(accentColor),
        metalness: 0.8,
        roughness: 0.2,
      });
      const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
      bridge.position.set(-18, 10, -32);
      rootGroup.add(bridge);

      // District ground grid
      const cityFloor = new THREE.GridHelper(160, 16, 0x38bdf8, 0x1e293b);
      cityFloor.position.y = -50;
      rootGroup.add(cityFloor);
    } else if (currentModel === "energy") {
      // ----------------------------------------------------
      // 8. 3D CLEAN ENERGY / WIND TURBINE & SOLAR
      // ----------------------------------------------------
      const towerGeo = new THREE.CylinderGeometry(3.5, 7.5, 120, 24);
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.3,
        metalness: 0.4,
      });
      const towerMesh = new THREE.Mesh(towerGeo, towerMat);
      towerMesh.position.set(0, 10, 0);
      rootGroup.add(towerMesh);

      const nacelleGeo = new THREE.BoxGeometry(12, 11, 26);
      const nacelleMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.2,
        metalness: 0.6,
      });
      const nacelleMesh = new THREE.Mesh(nacelleGeo, nacelleMat);
      nacelleMesh.position.set(0, 70, 0);
      rootGroup.add(nacelleMesh);

      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 70, 14);
      rootGroup.add(rotorGroup);

      const hubGeo = new THREE.SphereGeometry(6, 20, 20);
      const hubMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8 });
      const hubMesh = new THREE.Mesh(hubGeo, hubMat);
      rotorGroup.add(hubMesh);

      for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3;
        const bladeGroup = new THREE.Group();
        bladeGroup.rotation.z = angle;

        const bladeGeo = new THREE.BoxGeometry(3.2, 58, 1.2);
        bladeGeo.translate(0, 29, 0);
        const bladeMat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.15,
          metalness: 0.3,
        });
        const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
        bladeGroup.add(bladeMesh);

        const tipGeo = new THREE.BoxGeometry(3.4, 8, 1.4);
        tipGeo.translate(0, 54, 0);
        const tipMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const tipMesh = new THREE.Mesh(tipGeo, tipMat);
        bladeGroup.add(tipMesh);

        rotorGroup.add(bladeGroup);
      }

      perFrameUpdates.push(() => {
        rotorGroup.rotation.z += 0.025;
      });

      // Solar panel arrays angled at base
      const panelPositions: [number, number, number, number][] = [
        [-40, -45, -35, Math.PI / 6],
        [40, -45, -35, Math.PI / 6],
        [-40, -45, 35, -Math.PI / 6],
        [40, -45, 35, -Math.PI / 6],
      ];

      panelPositions.forEach(([px, py, pz, pitch]) => {
        const panelGroup = new THREE.Group();
        panelGroup.position.set(px, py, pz);
        panelGroup.rotation.x = pitch;

        const pGeo = new THREE.BoxGeometry(32, 2, 22);
        const pMat = new THREE.MeshStandardMaterial({
          color: 0x1e3a8a,
          roughness: 0.1,
          metalness: 0.8,
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        panelGroup.add(pMesh);

        const wireGeo = new THREE.WireframeGeometry(pGeo);
        const wireMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, opacity: 0.7, transparent: true });
        const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
        panelGroup.add(wireMesh);

        rootGroup.add(panelGroup);
      });

      // Swirling Emerald Energy Flow Particles
      const energyCount = 200;
      const energyPos = new Float32Array(energyCount * 3);
      for (let i = 0; i < energyCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const rad = 25 + Math.random() * 45;
        const y = (Math.random() - 0.5) * 120 + 10;
        energyPos[i * 3] = rad * Math.cos(theta);
        energyPos[i * 3 + 1] = y;
        energyPos[i * 3 + 2] = rad * Math.sin(theta);
      }
      const energyGeo = new THREE.BufferGeometry();
      energyGeo.setAttribute("position", new THREE.BufferAttribute(energyPos, 3));
      const energyMat = new THREE.PointsMaterial({
        size: 3,
        color: 0x10b981,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
      });
      const energyPoints = new THREE.Points(energyGeo, energyMat);
      rootGroup.add(energyPoints);
    } else if (currentModel === "server") {
      // ----------------------------------------------------
      // 9. 3D SERVER RACK & AI COMPUTE INFRASTRUCTURE
      // ----------------------------------------------------
      const rackGeo = new THREE.BoxGeometry(64, 130, 48);
      const rackMat = new THREE.MeshPhysicalMaterial({
        color: 0x090d16,
        metalness: 0.9,
        roughness: 0.25,
      });
      const rackMesh = new THREE.Mesh(rackGeo, rackMat);
      rootGroup.add(rackMesh);

      const rackWireGeo = new THREE.WireframeGeometry(rackGeo);
      const rackWireMat = new THREE.LineBasicMaterial({ color: 0x334155 });
      const rackWire = new THREE.LineSegments(rackWireGeo, rackWireMat);
      rootGroup.add(rackWire);

      for (let i = 0; i < 6; i++) {
        const sy = -50 + i * 20;
        const bladeGeo = new THREE.BoxGeometry(56, 15, 42);
        const bladeMat = new THREE.MeshStandardMaterial({
          color: 0x111827,
          metalness: 0.8,
          roughness: 0.3,
        });
        const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
        bladeMesh.position.set(0, sy, 2);
        rootGroup.add(bladeMesh);

        const stripGeo = new THREE.BoxGeometry(50, 1.5, 1);
        const stripMat = new THREE.MeshBasicMaterial({
          color: i === 3 ? 0xa855f7 : new THREE.Color(accentColor),
        });
        const stripMesh = new THREE.Mesh(stripGeo, stripMat);
        stripMesh.position.set(0, sy + 5, 23.5);
        rootGroup.add(stripMesh);

        for (let d = 0; d < 5; d++) {
          const ledGeo = new THREE.SphereGeometry(1.2, 10, 10);
          const ledColor = d === 4 ? 0xf59e0b : d % 2 === 0 ? 0x10b981 : 0x38bdf8;
          const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
          const led = new THREE.Mesh(ledGeo, ledMat);
          led.position.set(-20 + d * 6, sy - 3, 23.5);
          rootGroup.add(led);
        }
      }

      // Central Floating Quantum Processor Core
      const qpuGeo = new THREE.OctahedronGeometry(22, 0);
      const qpuMat = new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x1e3a8a,
        transmission: 0.7,
        roughness: 0.1,
        metalness: 0.3,
      });
      const qpu = new THREE.Mesh(qpuGeo, qpuMat);
      qpu.position.set(0, 10, 38);
      rootGroup.add(qpu);

      const qpuRingGeo = new THREE.TorusGeometry(32, 1.5, 16, 40);
      const qpuRingMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        wireframe: true,
      });
      const qpuRing = new THREE.Mesh(qpuRingGeo, qpuRingMat);
      qpuRing.position.set(0, 10, 38);
      rootGroup.add(qpuRing);

      perFrameUpdates.push(() => {
        qpu.rotation.y += 0.02;
        qpuRing.rotation.z += 0.015;
      });
    } else if (currentModel === "logistics") {
      // ----------------------------------------------------
      // 10. 3D LOGISTICS & GLOBAL SUPPLY CHAIN
      // ----------------------------------------------------
      const containers = [
        { x: -28, y: -40, z: -15, w: 26, h: 22, d: 52, col: 0x0284c7 },
        { x: 28,  y: -40, z: -15, w: 26, h: 22, d: 52, col: 0xe11d48 },
        { x: 0,   y: -18, z: -15, w: 26, h: 22, d: 52, col: 0xf59e0b },
        { x: -16, y: -40, z: 25,  w: 24, h: 20, d: 38, col: 0x10b981 },
        { x: 18,  y: -40, z: 25,  w: 24, h: 20, d: 38, col: 0x6366f1 },
      ];

      containers.forEach((c) => {
        const cGeo = new THREE.BoxGeometry(c.w, c.h, c.d);
        const cMat = new THREE.MeshStandardMaterial({
          color: c.col,
          metalness: 0.7,
          roughness: 0.3,
        });
        const cMesh = new THREE.Mesh(cGeo, cMat);
        cMesh.position.set(c.x, c.y, c.z);
        rootGroup.add(cMesh);

        const wireGeo = new THREE.WireframeGeometry(cGeo);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.4,
        });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        wire.position.set(c.x, c.y, c.z);
        rootGroup.add(wire);
      });

      // Automated Cargo Drone hovering overhead
      const droneGroup = new THREE.Group();
      droneGroup.position.set(0, 35, 0);
      rootGroup.add(droneGroup);

      const droneBodyGeo = new THREE.BoxGeometry(28, 6, 28);
      const droneBodyMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.8,
        roughness: 0.2,
      });
      const droneBody = new THREE.Mesh(droneBodyGeo, droneBodyMat);
      droneGroup.add(droneBody);

      const podOffsets: [number, number][] = [[-18, -18], [18, -18], [-18, 18], [18, 18]];
      podOffsets.forEach(([px, pz]) => {
        const ringGeo = new THREE.TorusGeometry(8, 1.2, 12, 24);
        ringGeo.rotateX(Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(px, 3, pz);
        droneGroup.add(ringMesh);
      });

      // Cargo tracking laser beam
      const beamGeo = new THREE.CylinderGeometry(1, 1, 45, 12);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, 12, 0);
      rootGroup.add(beam);

      // Terminal Waypoint Ground Hex Grid
      const terminalGrid = new THREE.GridHelper(160, 16, 0xf59e0b, 0x334155);
      terminalGrid.position.y = -52;
      rootGroup.add(terminalGrid);
    } else if (currentModel === "medical") {
      // ----------------------------------------------------
      // 11. 3D MEDICAL / HOSPITAL & CLINICAL HEALTH CROSS
      // ----------------------------------------------------
      const crossMat = new THREE.MeshPhysicalMaterial({
        color: 0xef4444,
        emissive: 0x450a0a,
        metalness: 0.2,
        roughness: 0.15,
        clearcoat: 0.8,
      });

      const crossHorizGeo = new THREE.BoxGeometry(60, 20, 20);
      const crossHoriz = new THREE.Mesh(crossHorizGeo, crossMat);
      rootGroup.add(crossHoriz);

      const crossVertGeo = new THREE.BoxGeometry(20, 60, 20);
      const crossVert = new THREE.Mesh(crossVertGeo, crossMat);
      rootGroup.add(crossVert);

      const crossWireGeo1 = new THREE.WireframeGeometry(crossHorizGeo);
      const crossWireGeo2 = new THREE.WireframeGeometry(crossVertGeo);
      const crossWireMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
      });
      const wire1 = new THREE.LineSegments(crossWireGeo1, crossWireMat);
      const wire2 = new THREE.LineSegments(crossWireGeo2, crossWireMat);
      rootGroup.add(wire1);
      rootGroup.add(wire2);

      // Pulsing Vital Heartbeat / ECG Halo Ring
      const haloGeo = new THREE.TorusGeometry(54, 2, 16, 64);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.rotation.x = Math.PI / 4;
      rootGroup.add(haloMesh);

      const capsuleGroup = new THREE.Group();
      rootGroup.add(capsuleGroup);

      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const capGeo = new THREE.CapsuleGeometry(4, 10, 8, 16);
        const capMat = new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x10b981 : 0x38bdf8,
          roughness: 0.2,
          metalness: 0.5,
        });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(65 * Math.cos(ang), 10 * Math.sin(ang * 2), 65 * Math.sin(ang));
        capsuleGroup.add(cap);
      }

      perFrameUpdates.push((t) => {
        haloMesh.rotation.z += 0.01;
        capsuleGroup.rotation.y += 0.015;
        const pulse = 1 + Math.sin(t * 0.005) * 0.04;
        crossHoriz.scale.set(pulse, pulse, pulse);
        crossVert.scale.set(pulse, pulse, pulse);
      });

      const diagFloor = new THREE.GridHelper(160, 16, 0xef4444, 0x1e293b);
      diagFloor.position.y = -50;
      rootGroup.add(diagFloor);
    }

    // ----------------------------------------------------
    // GLTF / GLB MODEL LOADER (For Custom or Domain 3D URLs)
    // ----------------------------------------------------
    if (modelUrl || currentModel === "custom") {
      const activeUrl = modelUrl;
      if (activeUrl) {
        setIsLoadingModel(true);
        setModelLoadError(null);
        const loader = new GLTFLoader();
        loader.load(
          activeUrl,
          (gltf) => {
            setIsLoadingModel(false);
            const modelScene = gltf.scene;

            // Auto-center and normalize scale
            const box = new THREE.Box3().setFromObject(modelScene);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            modelScene.position.x -= center.x;
            modelScene.position.y -= center.y;
            modelScene.position.z -= center.z;

            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              const scale = 110 / maxDim;
              modelScene.scale.set(scale, scale, scale);
            }

            rootGroup.add(modelScene);
          },
          undefined,
          (err) => {
            console.warn("Failed to load 3D GLB model:", err);
            setIsLoadingModel(false);
            setModelLoadError("Failed to load GLB model. Falling back to 3D archetype.");
          }
        );
      }
    }

    // Interactive Drag to Rotate Logic
    let isPointerDown = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let targetRotationX = 0.2;
    let targetRotationY = 0;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!interactive) return;
      isPointerDown = true;
      setIsDragging(true);
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      prevPointerX = clientX;
      prevPointerY = clientY;
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isPointerDown) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - prevPointerX;
      const deltaY = clientY - prevPointerY;
      prevPointerX = clientX;
      prevPointerY = clientY;

      targetRotationY += deltaX * 0.008;
      targetRotationX += deltaY * 0.008;

      // Limit vertical pitch to avoid flipping
      targetRotationX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, targetRotationX));
    };

    const handlePointerUp = () => {
      isPointerDown = false;
      setIsDragging(false);
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    dom.addEventListener("touchstart", handlePointerDown, { passive: true });
    window.addEventListener("touchmove", handlePointerMove, { passive: true });
    window.addEventListener("touchend", handlePointerUp);

    cleanups.push(() => {
      dom.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      dom.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    });

    // Resize handling
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Animation loop. It only runs while the viewer is on screen and the tab is visible
    // (D1 item 2); with reduced motion there is no auto-rotation or ambient animation, so
    // after settling it renders only while the user drags (D1 items 3 and 11).
    const reducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let animId = 0;
    let running = false;
    let onScreen = true;
    const visible = () => onScreen && !document.hidden;
    const start = () => {
      if (!running && visible()) {
        running = true;
        animId = requestAnimationFrame(animate);
      }
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(animId);
    };
    const animate = () => {
      if (!visible()) {
        stop();
        return;
      }
      animId = requestAnimationFrame(animate);

      // Auto rotation when idle
      if (!isPointerDown && !reducedMotion) {
        targetRotationY += autoRotateSpeed;
      }

      // Smooth damping interpolation
      rootGroup.rotation.y += (targetRotationY - rootGroup.rotation.y) * 0.1;
      rootGroup.rotation.x += (targetRotationX - rootGroup.rotation.x) * 0.1;

      // Custom per-frame procedural animations (rotors, beacons, particles)
      if (!reducedMotion) perFrameUpdates.forEach((fn) => fn(performance.now()));

      renderer.render(scene, camera);

      if (reducedMotion && !isPointerDown) {
        const settled =
          Math.abs(targetRotationY - rootGroup.rotation.y) < 0.0005 &&
          Math.abs(targetRotationX - rootGroup.rotation.x) < 0.0005;
        if (settled) stop();
      }
    };

    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          if (onScreen) start();
          else stop();
        })
      : null;
    io?.observe(container);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const wake = () => start();
    renderer.domElement.addEventListener("pointerdown", wake);
    renderer.domElement.addEventListener("touchstart", wake, { passive: true });

    start();

    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("pointerdown", wake);
      renderer.domElement.removeEventListener("touchstart", wake);
      resizeObserver.disconnect();
      cleanups.forEach((c) => c());
      // Free GPU memory (D1 item 5): geometries, materials and textures were never disposed.
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          for (const value of Object.values(m)) {
            if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
          }
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [currentModel, modelUrl, accentColor, autoRotateSpeed, interactive]);

  const switchModel = (type: Model3DType) => {
    setCurrentModel(type);
    onModelChange?.(type);
  };

  const modelsList: { id: Model3DType; label: string; icon: React.ReactNode }[] = [
    { id: "globe", label: "Globe", icon: <Globe size={12} /> },
    { id: "crystal", label: "Tech Prism", icon: <Box size={12} /> },
    { id: "medical", label: "Medical", icon: <HeartPulse size={12} /> },
    { id: "dna", label: "DNA", icon: <Dna size={12} /> },
    { id: "torus", label: "Quantum", icon: <Disc size={12} /> },
    { id: "automotive", label: "Mobility", icon: <Car size={12} /> },
    { id: "finance", label: "Fintech", icon: <TrendingUp size={12} /> },
    { id: "city", label: "City", icon: <Building2 size={12} /> },
    { id: "energy", label: "Energy", icon: <Zap size={12} /> },
    { id: "server", label: "Compute", icon: <Server size={12} /> },
    { id: "logistics", label: "Logistics", icon: <Package size={12} /> },
  ];

  if (modelUrl) {
    modelsList.unshift({ id: "custom", label: "Custom 3D", icon: <FolderOpen size={12} /> });
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "260px",
        borderRadius: "16px",
        overflow: "hidden",
        background: "radial-gradient(ellipse at center, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 1) 100%)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5), inset 0 0 40px rgba(56, 189, 248, 0.08)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        ...style,
      }}
      className={`interactive-3d-container ${className}`}
    >
      {/* Three.js Canvas Container */}
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {webglUnavailable && (
        <div
          role="note"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            textAlign: "center",
            color: "#CBD5E1",
            fontSize: "13px",
          }}
        >
          3D preview isn't available on this device.
        </div>
      )}

      {/* Loading Overlay */}
      {isLoadingModel && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(6px)",
            color: "#38BDF8",
            gap: "8px",
            fontSize: "12px",
            fontWeight: 600,
            zIndex: 20,
          }}
        >
          <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
          <span>Loading 3D Asset...</span>
        </div>
      )}

      {/* Load Error Notice */}
      {modelLoadError && (
        <div
          style={{
            position: "absolute",
            bottom: "44px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(239, 68, 68, 0.85)",
            backdropFilter: "blur(6px)",
            color: "#FFFFFF",
            padding: "3px 10px",
            borderRadius: "10px",
            fontSize: "10px",
            fontWeight: 500,
            pointerEvents: "none",
            zIndex: 15,
          }}
        >
          {modelLoadError}
        </div>
      )}

      {/* Top Floating Model Selector Tabs */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          maxWidth: "calc(100% - 150px)",
          overflowX: "auto",
          scrollbarWidth: "none",
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          padding: "3px 6px",
          zIndex: 10,
        }}
      >
        {modelsList.map((m) => {
          const isActive = currentModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => switchModel(m.id)}
              title={`Switch to 3D ${m.label}`}
              style={{
                background: isActive ? "rgba(56, 189, 248, 0.25)" : "transparent",
                border: isActive ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid transparent",
                borderRadius: "14px",
                color: isActive ? "#38BDF8" : "#94A3B8",
                padding: "4px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      {/* Interactive Drag Hint Pill */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          backgroundColor: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "#E2E8F0",
          padding: "4px 12px",
          borderRadius: "20px",
          fontSize: "11px",
          fontWeight: 600,
          pointerEvents: "none",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        }}
      >
        <Compass size={13} color="#38BDF8" />
        <span>Drag to Rotate 360°</span>
      </div>

      {/* 3D Holographic Badge */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          display: "flex",
          alignItems: "center",
          gap: "5px",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
          color: "#38BDF8",
          padding: "3px 10px",
          borderRadius: "12px",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.04em",
          pointerEvents: "none",
        }}
      >
        <Sparkles size={11} />
        <span>3D ROTATABLE</span>
      </div>
    </div>
  );
};
