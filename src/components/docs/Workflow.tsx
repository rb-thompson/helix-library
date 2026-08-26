import Link from "next/link";

export type WorkflowStep = {
  title: string;
  body: string;
  href?: string;
};

export function Workflow({
  label,
  steps,
}: {
  label: string;
  steps: WorkflowStep[];
}) {
  return (
    <ol className="workflow" aria-label={label}>
      {steps.map((step, i) => (
        <li key={step.title} className="workflow-step">
          <span className="workflow-n" aria-hidden>
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="workflow-title">
              {step.href ? (
                <Link href={step.href} className="link-accent">
                  {step.title}
                </Link>
              ) : (
                step.title
              )}
            </p>
            <p className="workflow-body">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
