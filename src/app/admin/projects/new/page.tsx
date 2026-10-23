import { createProject } from '../actions';

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="mb-1 text-2xl font-medium text-navy">Add a new project</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Client info is stored here for your reference — no login is created for them yet.
      </p>

      <form action={createProject} className="space-y-4">
        <Field label="Client name" name="clientName" required />
        <Field label="Entity name (optional)" name="entityName" />
        <Field label="Project address" name="address" />
        <Field label="Phone" name="phone" />
        <Field label="Email" name="email" type="email" />
        <Field label="Project name" name="projectName" required />

        <button
          type="submit"
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white"
        >
          Create project
        </button>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  type = 'text',
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
      />
    </div>
  );
}
