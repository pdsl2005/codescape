import { computeLayout } from './placer';
import { BuildingNode } from './types';

// Example: edit this array to test your own classes and relationships
const nodes: BuildingNode[] = [
  { id: 'A', name: 'A', neighbors: ['B', 'C'] },
  { id: 'B', name: 'B', neighbors: [] },
  { id: 'C', name: 'C', neighbors: [] },
  { id: 'D', name: 'D', neighbors: [] },
  { id: 'E', name: 'E', neighbors: ['F'] },
  { id: 'F', name: 'F', neighbors: ['E'] }, // circular reference
  { id: 'G', name: 'G', neighbors: [] }
];

const layout = computeLayout(nodes);
console.log('Layout result:', layout);
