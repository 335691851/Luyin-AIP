import { assessmentTone } from "@/lib/pricing-presentation";
function emphasized(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
export default function PricingAssessment({ text }: { text: string }) {
  return (
    <div className="pricing-assessment-text" aria-label="整批智能评估建议">
      {text
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line, index) => {
          const tone = assessmentTone(line);
          const heading = /^\s*#{1,6}\s/.test(line);
          const content = line.replace(/^\s*#{1,6}\s*/, "");
          return (
            <p
              key={index}
              className={`pricing-assessment-line assessment-${tone}${heading ? " assessment-heading" : ""}`}
            >
              {tone !== "normal" && (
                <span className="assessment-marker">
                  {tone === "risk"
                    ? "风险关注"
                    : tone === "warning"
                      ? "待核实"
                      : "核心建议"}
                </span>
              )}
              {emphasized(content)}
            </p>
          );
        })}
    </div>
  );
}
