import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { assessmentTone } from "../lib/pricing-presentation";
export default function PricingAssessment({
  text,
  label = "整批智能评估建议",
}: {
  text: string;
  label?: string;
}) {
  return (
    <div
      className="pricing-assessment-text governance-markdown"
      aria-label={label}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          strong: ({ children }) => (
            <strong
              className={`assessment-emphasis assessment-${assessmentTone(String(children))}`}
            >
              {children}
            </strong>
          ),
          table: ({ children }) => (
            <div className="governance-markdown-table">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
