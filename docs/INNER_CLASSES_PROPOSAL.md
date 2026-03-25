# Inner Classes Rendering Proposal (SCRUM-118)

## Overview
This document outlines the approach for representing and visualizing inner/nested classes in the Codescape city visualization.

## JSON Schema Design

### ClassInfo Extended Properties
```typescript
export interface ClassInfo {
  // ... existing properties ...
  
  // Inner/nested class support
  parentClass?: string;        
  innerClasses?: string[];     
  isStatic?: boolean;          
  isAnonymous?: boolean;       
```

### Example JSON Output
```json
{
  "Classname": "OuterClass",
  "Type": "public",
  "parentClass": undefined,
  "innerClasses": ["InstanceInnerClass", "StaticNestedClass", "PrivateInnerClass"],
  "Methods": [...],
  "Fields": [...],
  "Constructors": [...]
}
```

```json
{
  "Classname": "InstanceInnerClass",
  "Type": "public",
  "parentClass": "OuterClass",
  "isStatic": false,
  "Methods": [...],
  "Fields": [...],
  "Constructors": [...]
}
```

```json
{
  "Classname": "StaticNestedClass",
  "Type": "public",
  "parentClass": "OuterClass",
  "isStatic": true,
  "Methods": [...],
  "Fields": [...],
  "Constructors": [...]
}
```

## Rendering Strategy: Separate Buildings with Visual Indicators

### Rationale
Three visualization options were reviewed. The chosen approach renders each class as an
independent building while using visual cues to indicate parent–child relationships. This
keeps the city clear and interactive, allows any class to be selected on its own, and
leverages depth and positioning to convey hierarchy without cluttering the view.

### Approache Taken

#### Separate Buildings with Visual Indicators (chosen)
Each class is drawn on its own; inner classes are rendered smaller and placed near
their parent, with a visual link to indicate the relationship. The goals are to:
- allow any class to be selected independently,
- convey hierarchy through relative size and placement,
- handle multiple nesting levels without overlap,
- integrate smoothly with the overall layout.
- Trade‑off: this approach can use more layout area.

## Implementation Details

### Layout Algorithm
```
1. Place top-level classes in a grid.
2. For each inner class:
   - position it relative to its parent, shifted slightly to indicate hierarchy
   - record a nesting depth value for use in rendering
   - scale the building size according to its depth
```

### Visual Differentiation

#### Size Scaling
Buildings representing inner classes are rendered smaller than their parents; each
additional level of nesting reduces size incrementally. The exact scaling factor is
left to the renderer, but the effect should make deeper classes appear subordinate
while remaining legible.

#### Positioning
Inner classes sit near their parent, shifted slightly along both axes so they do not
overlap. The shift direction follows the isometric grid, reinforcing the parent‑child
relationship without hardcoded coordinates.

#### Connector Lines
- **Style**: Dashed line (2-2 dash pattern)
- **Color**: Semi-transparent gray (rgba(200, 200, 200, 0.5))
- **Width**: 1px
- **Purpose**: Visual indication of parent-child relationship

#### Static Indicator
Static nested classes could be rendered with:
- Different color tint (slightly desaturated)
- Icon overlay (small "S" badge)
- Currently: Same visual treatment, but marked in data

### Class Type Indicators
- **Instance Inner**: Regular rendering
- **Static Nested**: Marked via `isStatic` flag, could add visual styling
- **Private/Protected**: Uses existing Type system
- **Anonymous**: Uses `isAnonymous` flag for future special rendering

```
### Visual Example (Isometric View)
```
Regular layout:
┌────────────┐
│ OuterClass │
└────────────┘
      ↙
 ┌──────────┐
 │ InnerCS1 │
 └──────────┘
      ↙
┌───────────┐
│ InnerCS2  │ (smaller, offset, connected)
└───────────┘
```

## Data Flow

### Parser Output
```
extractClasses() → ClassInfo[]
├─ OuterClass { innerClasses: ["Inner1", "Inner2"], parentClass: undefined }
├─ Inner1 { parentClass: "OuterClass", isStatic: true }
└─ Inner2 { parentClass: "OuterClass", isStatic: false }
```

### Layout Computation
```
computeLayout(buildingNodes) → LayoutMap
├─ OuterClass: { col: 3, row: 3, depth: 0 }
├─ Inner1: { col: 5, row: 4, depth: 1 }
└─ Inner2: { col: 5, row: 4, depth: 1 }
```

### Rendering
```
Canvas Render Loop:
1. Clear canvas
2. Draw all buildings (sized by depth)
3. Draw connector lines for inner classes
4. Apply zoom/pan transforms
```

## Depth Limitations
- Theoretically unlimited (recursion-based extraction)
- Practical rendering limit: ~5-6 levels before size becomes negligible
- Scrolling/panning handles viewing of deep hierarchies

## Future Enhancements

1. **Interactive Expansion** - Click parent to show/hide inner classes
2. **Color Coding** - Different colors for static vs instance classes
3. **Badges** - Icons/badges for modifiers (static, final, abstract)
4. **Hover Details** - Show inner class list on parent hover
5. **Dependency Highlighting** - Highlight classes that depend on inner classes

## Testing

All implementation verified with:
- Three test fixtures (InnerClasses.java, DeepNestedClasses.java, InterfaceWithInnerTypes.java)
- Six layout tests covering nested positioning
- Three parser tests verifying extraction accuracy
- Support for four or more levels of nesting

## Conclusion

The **separate buildings with visual indicators** approach provides a scalable, intuitive visualization that maintains the city metaphor while clearly showing class hierarchies through relative positioning, scaling, and connector lines.
