import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export default function KneeModel3D({ angleDeg = 0 }) {
  const mountRef = useRef(null);
  const angleRef = useRef(angleDeg); // <-- store latest angleDeg

  // Always keep angleRef up to date with prop
  useEffect(() => {
    angleRef.current = angleDeg;
  }, [angleDeg]);

  const threeRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    femur: null,
    tibiaPivot: null,
    tibia: null,
    currentAngle: 0,
    rafId: null,
  });

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const WIDTH = mountEl.clientWidth || 600;
    const HEIGHT = mountEl.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f4ff);

    const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 0.1, 100);
    camera.position.set(6, 4, 12);
    camera.lookAt(0, 1.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(WIDTH, HEIGHT);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountEl.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
    grid.position.y = -0.01;
    scene.add(grid);

    const femurMat = new THREE.MeshStandardMaterial({ color: 0x457b9d });
    const tibiaMat = new THREE.MeshStandardMaterial({ color: 0x1d3557 });

    const femurGeo = new THREE.BoxGeometry(1, 4, 1);
    const femur = new THREE.Mesh(femurGeo, femurMat);
    femur.position.set(0, 2, 0);
    scene.add(femur);

    const tibiaPivot = new THREE.Group();
    tibiaPivot.position.set(0, 0, 0);
    scene.add(tibiaPivot);

    const tibiaGeo = new THREE.BoxGeometry(1, 4, 1);
    const tibia = new THREE.Mesh(tibiaGeo, tibiaMat);
    tibia.position.set(0, -2, 0);
    tibiaPivot.add(tibia);

    threeRef.current.scene = scene;
    threeRef.current.camera = camera;
    threeRef.current.renderer = renderer;
    threeRef.current.femur = femur;
    threeRef.current.tibiaPivot = tibiaPivot;
    threeRef.current.tibia = tibia;
    threeRef.current.currentAngle = 0;

    const animate = () => {
      // Always use the latest angleDeg from angleRef
      const target = clamp(angleRef.current, 0, 120);
      threeRef.current.currentAngle += (target - threeRef.current.currentAngle) * 0.1;
      const rad = THREE.MathUtils.degToRad(-threeRef.current.currentAngle);
      tibiaPivot.rotation.z = rad;

      renderer.render(scene, camera);
      threeRef.current.rafId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || WIDTH;
      const h = mountRef.current.clientHeight || HEIGHT;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(threeRef.current.rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
      femurGeo.dispose();
      tibiaGeo.dispose();
      femurMat.dispose();
      tibiaMat.dispose();
    };
    // eslint-disable-next-line
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height: 320,
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
      }}
    />
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}