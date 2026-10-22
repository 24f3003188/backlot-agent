import { createRoot, type Root } from 'react-dom/client';
import ThoughtLine, { type ThoughtLineProps } from './ThoughtLine.js';

export interface ThoughtController {
  update: (props: Partial<ThoughtLineProps>) => void;
  addStep: (step: string) => void;
  setWorking: (working: boolean) => void;
  destroy: () => void;
}

export function mountThoughtLine(
  targetElement: HTMLElement,
  initialProps: Partial<ThoughtLineProps> = {}
): ThoughtController {
  targetElement.style.width = '100%';
  targetElement.style.boxSizing = 'border-box';
  let root: Root | null = createRoot(targetElement);
  let currentProps: ThoughtLineProps = {
    label: initialProps.label || 'Reasoning with Qloo taste graph…',
    doneLabel: initialProps.doneLabel || 'Thought for',
    glyph: initialProps.glyph || 'sparkle',
    steps: initialProps.steps || [],
    fontSize: initialProps.fontSize || 15,
    breathPeriod: 1.6,
    breathDepth: 0.45,
    settleDuration: 350,
    settleBlur: 2,
    collapsible: true,
    collapseOnSettle: false,
    showTimer: true,
    working: initialProps.working ?? true,
    color: initialProps.color || '#fbc531',
    glyphColor: initialProps.glyphColor || '#fbc531',
    ...initialProps,
  };

  const render = () => {
    if (root) {
      root.render(<ThoughtLine {...currentProps} />);
    }
  };

  render();

  return {
    update(nextProps: Partial<ThoughtLineProps>) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    addStep(step: string) {
      const existing = currentProps.steps || [];
      if (!existing.includes(step)) {
        currentProps = {
          ...currentProps,
          steps: [...existing, step],
        };
        render();
      }
    },
    setWorking(working: boolean) {
      currentProps = { ...currentProps, working };
      render();
    },
    destroy() {
      if (root) {
        root.unmount();
        root = null;
      }
    },
  };
}
