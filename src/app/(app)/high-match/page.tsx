import { JobList } from "@/components/job-list";
import { PageHeader } from "@/components/ui";

export default function HighMatchPage() {
  return (
    <>
      <PageHeader title="High-match opportunities" subtitle={`Jobs scoring ${process.env.HIGH_MATCH_THRESHOLD ?? 75}+ against your CV. AI scores are authoritative; "est." scores are keyword estimates.`} />
      <JobList view="high" emptyTitle="No high matches yet" emptyText="Run a search on Find Jobs after uploading your CV. The best keyword matches are evaluated by AI automatically." />
    </>
  );
}
