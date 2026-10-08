import { JobList } from "@/components/job-list";
import { PageHeader } from "@/components/ui";

export default function SavedPage() {
  return (
    <>
      <PageHeader title="Saved jobs" subtitle="Bookmarked vacancies you want to come back to." />
      <JobList view="saved" emptyTitle="Nothing saved yet" emptyText="Use the bookmark icon on any job card to keep it here." />
    </>
  );
}
