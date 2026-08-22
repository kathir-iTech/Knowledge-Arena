'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface MindMapNode {
  topic: string;
  subtopics: string[];
}

interface MindMapConnection {
  from: string;
  to: string;
  label?: string;
}

interface MindMapData {
  title: string;
  nodes: MindMapNode[];
  connections: MindMapConnection[];
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  label: string;
  type: 'center' | 'topic' | 'subtopic';
  parentId?: string;
}

interface LayoutLink {
  source: string;
  target: string;
  label?: string;
}

function radialLayout(data: MindMapData, width: number, height: number): { nodes: LayoutNode[]; links: LayoutLink[] } {
  const cx = width / 2;
  const cy = height / 2;
  const topicRadius = Math.min(width, height) * 0.3;
  const subtopicRadius = Math.min(width, height) * 0.14;

  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];

  // Center node
  nodes.push({ id: 'center', x: cx, y: cy, label: data.title, type: 'center' });

  const topicCount = data.nodes.length;
  data.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / topicCount - Math.PI / 2;
    const tx = cx + topicRadius * Math.cos(angle);
    const ty = cy + topicRadius * Math.sin(angle);
    const topicId = 'topic-' + i;
    nodes.push({ id: topicId, x: tx, y: ty, label: node.topic, type: 'topic' });
    links.push({ source: 'center', target: topicId });

    const subCount = node.subtopics.length;
    node.subtopics.forEach((sub, j) => {
      const subAngle = angle + ((j - (subCount - 1) / 2) * 0.5) / Math.max(subCount, 1);
      const stx = tx + subtopicRadius * Math.cos(subAngle);
      const sty = ty + subtopicRadius * Math.sin(subAngle);
      const subId = 'sub-' + i + '-' + j;
      nodes.push({ id: subId, x: stx, y: sty, label: sub.length > 30 ? sub.slice(0, 28) + '...' : sub, type: 'subtopic', parentId: topicId });
      links.push({ source: topicId, target: subId });
    });
  });

  // Add explicit connections between topics
  for (const conn of data.connections) {
    const srcNode = nodes.find(n => n.type === 'topic' && n.label.toLowerCase().includes(conn.from.toLowerCase().slice(0, 10)));
    const tgtNode = nodes.find(n => n.type === 'topic' && n.label.toLowerCase().includes(conn.to.toLowerCase().slice(0, 10)));
    if (srcNode && tgtNode && srcNode.id !== tgtNode.id) {
      links.push({ source: srcNode.id, target: tgtNode.id, label: conn.label });
    }
  }

  return { nodes, links };
}

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

function getColors(isDark: boolean) {
  if (isDark) {
    return {
      center: { fill: '#7c3aed', text: '#ffffff', stroke: '#6d28d9' },
      topic: { fill: '#2a2320', text: '#e8ddd0', stroke: '#4a4038' },
      subtopic: { fill: '#1f1a17', text: '#b8a898', stroke: '#3a3330' },
    };
  }
  return {
    center: { fill: '#7c3aed', text: '#ffffff', stroke: '#6d28d9' },
    topic: { fill: '#f3f4f6', text: '#1f2937', stroke: '#d1d5db' },
    subtopic: { fill: '#ffffff', text: '#4b5563', stroke: '#e5e7eb' },
  };
}

export function MindMapSVG({ data }: { data: MindMapData }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dark = useDarkMode();
  const COLORS = getColors(dark);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const handleResize = () => {
      if (svgRef.current?.parentElement) {
        const rect = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width: Math.max(600, rect.width), height: Math.max(400, rect.width * 0.6) });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(true); }, []);

  const { nodes, links } = radialLayout(data, dimensions.width, dimensions.height);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const exportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.svg';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="relative w-full">
      <button
        onClick={exportSVG}
        className="absolute top-2 right-2 z-10 text-xs bg-background/80 backdrop-blur border border-border/50 px-3 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
      >
        Export SVG
      </button>
      <svg
        ref={svgRef}
        viewBox={'0 0 ' + dimensions.width + ' ' + dimensions.height}
        className={cn("w-full h-auto rounded-xl bg-card border border-border/30 transition-opacity", loaded ? "opacity-100" : "opacity-50 animate-pulse")}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.08" />
          </filter>
        </defs>
        <g>
          {links.map((link, i) => {
            const src = nodeMap.get(link.source);
            const tgt = nodeMap.get(link.target);
            if (!src || !tgt) return null;
            const isExplicit = !!link.label;
            return (
              <g key={'link-' + i}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke={isExplicit ? '#a78bfa' : (dark ? '#4a4038' : '#d1d5db')}
                  strokeWidth={isExplicit ? 1.5 : 1}
                  strokeDasharray={isExplicit ? '4,3' : undefined}
                  opacity={0.7}
                />
                {link.label && (
                  <text
                    x={(src.x + tgt.x) / 2}
                    y={(src.y + tgt.y) / 2 - 5}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize="9"
                  >
                    {link.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        <g>
          {nodes.map((node) => {
            const c = COLORS[node.type];
            const r = node.type === 'center' ? 48 : node.type === 'topic' ? 32 : 20;
            return (
              <g key={node.id} filter="url(#shadow)">
                {node.type === 'center' && (
                  <circle cx={node.x} cy={node.y} r={r + 4} fill="none" stroke={c.stroke} strokeWidth="1" opacity="0.3" />
                )}
                <circle cx={node.x} cy={node.y} r={r} fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={c.text}
                  fontSize={node.type === 'center' ? '11' : node.type === 'topic' ? '9' : '8'}
                  fontWeight={node.type === 'center' ? '700' : node.type === 'topic' ? '600' : '400'}
                  className="pointer-events-none"
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + '...' : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
