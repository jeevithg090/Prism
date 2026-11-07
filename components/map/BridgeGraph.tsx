"use client";

import { useEffect, useMemo, useRef } from "react";
import type { BridgeNode } from "@/lib/types";

const statusVariable = { proven: "--status-proven", "degree-done": "--status-degree", "degree-upcoming": "--status-degree", gap: "--status-gap" } as const;
export function BridgeGraph({ nodes, selected, onSelect }: { nodes: BridgeNode[]; selected?: string; onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positions = useMemo(() => nodes.slice(0, 120).map((node, index) => ({ node, x: .1 + ((index * 73) % 83) / 100, y: .12 + ((index * 47) % 72) / 100 })), [nodes]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const resize = () => {
      const box = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(box.width * ratio)); canvas.height = Math.max(1, Math.floor(box.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, box.width, box.height);
      positions.forEach(({ node, x, y }) => {
        const px = x * box.width, py = y * box.height, radius = 6 + node.demand * 14;
        const color = getComputedStyle(document.documentElement).getPropertyValue(statusVariable[node.status]).trim();
        if (node.trend === "rising") { context.beginPath(); context.arc(px, py, radius + 4, 0, Math.PI * 2); context.fillStyle = "rgba(217,119,6,.22)"; context.fill(); }
        context.beginPath(); context.arc(px, py, radius, 0, Math.PI * 2); context.fillStyle = color; context.fill();
        if (node.status === "degree-upcoming") { context.setLineDash([4, 3]); context.lineWidth = 2; context.strokeStyle = color; context.stroke(); context.setLineDash([]); }
        if (node.skillId === selected) { context.beginPath(); context.arc(px, py, radius + 7, 0, Math.PI * 2); context.lineWidth = 2; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary"); context.stroke(); }
        context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--foreground"); context.font = "12px var(--font-geist-sans), sans-serif"; context.fillText(node.name, px + radius + 4, py + 4);
      });
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); return () => observer.disconnect();
  }, [positions, selected]);
  function selectAt(event: React.MouseEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect(); let best: { id: string; distance: number } | null = null;
    for (const point of positions) { const dx = event.clientX - bounds.left - point.x * bounds.width, dy = event.clientY - bounds.top - point.y * bounds.height, distance = dx * dx + dy * dy; if (!best || distance < best.distance) best = { id: point.node.skillId, distance }; }
    if (best && best.distance < 90 * 90) onSelect(best.id);
  }
  return <canvas ref={canvasRef} onClick={selectAt} role="img" aria-label={`Bridge Map graph with ${positions.length} skills. Use the list view for keyboard navigation.`} className="h-[420px] w-full rounded-xl bg-background"/>;
}
