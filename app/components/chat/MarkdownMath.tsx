import { MathJax, MathJaxContext } from 'better-react-mathjax';

const config = {
  loader: { load: ['input/asciimath', 'output/chtml'] },
};

export const MarkdownMath = ({ formula, inline }: { formula: string; inline?: boolean }) => (
  <MathJaxContext config={config}>
    <MathJax inline={inline} dynamic>
      {formula}
    </MathJax>
  </MathJaxContext>
);
