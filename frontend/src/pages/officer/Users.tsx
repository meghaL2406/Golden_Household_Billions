import { useState } from "react";
import { Button, Icon, Input, Modal, Notice, PageHeader, Select, Skeleton, Table, Tag } from "../../components";
import { api } from "../../lib/api";
import { useAuth, type Role } from "../../lib/auth";
import { useApi, useToast } from "../../lib/hooks";
import { titleCase } from "../../lib/format";
import { errMsg, FilterBar, Options, useEnums } from "./_shared";

const ROLES: Role[] = ["SERVICE_OPERATOR", "VERIFICATION_OFFICER", "DEPARTMENT_OFFICER", "ADMIN"];

export default function Users() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") {
    return (
      <div className="stack" style={{ gap: 22 }}>
        <PageHeader eyebrow="USERS" title="Users" description="Officer accounts and their roles." />
        <Notice tone="warning">Only administrators can view and manage officer accounts.</Notice>
      </div>
    );
  }

  return <UsersAdmin />;
}

function UsersAdmin() {
  const enums = useEnums();
  const toast = useToast();
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApi<any[]>("/users", { role, status, q }, [role, status, q]);

  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  async function toggleActive(u: any) {
    const nextStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await api(`/users/${u.user_id}`, { method: "PATCH", body: { status: nextStatus } });
      toast.push(`${u.name} is now ${nextStatus === "ACTIVE" ? "active" : "inactive"}.`, "success");
      reload();
    } catch (e) {
      toast.push(errMsg(e), "danger");
    }
  }

  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader
        eyebrow="USERS"
        title="Users"
        description="Officer accounts, their roles and their district assignment."
        action={
          <Button icon={<Icon name="user-plus" size={15} />} onClick={() => setCreating(true)}>
            New user
          </Button>
        }
      />

      <FilterBar>
        <Input label="Search" placeholder="Name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <Options values={ROLES} allLabel="All roles" />
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <Options values={["ACTIVE", "INACTIVE"]} allLabel="All statuses" />
        </Select>
      </FilterBar>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && !data ? (
        <Skeleton rows={8} />
      ) : (
        <Table
          columns={[
            { key: "name", header: "Name", render: (u: any) => <span className="emph">{u.name}</span> },
            { key: "contact", header: "Contact", render: (u: any) => u.mobile ?? u.email ?? "—" },
            { key: "role", header: "Role", render: (u: any) => <Tag tone="blue">{titleCase(u.role)}</Tag> },
            { key: "district", header: "District", render: (u: any) => u.district ?? "—" },
            { key: "department", header: "Department", render: (u: any) => (u.department ? titleCase(u.department) : "—") },
            { key: "status", header: "Status", render: (u: any) => <Tag tone={u.status === "ACTIVE" ? "success" : "neutral"}>{titleCase(u.status ?? "ACTIVE")}</Tag> },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (u: any) => (
                <div className="row gap-8" style={{ justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setEditing(u)}>
                    Edit
                  </Button>
                  <Button size="sm" variant={u.status === "ACTIVE" ? "danger" : "primary"} onClick={() => toggleActive(u)}>
                    {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              ),
            },
          ]}
          rows={data ?? []}
          rowKey={(u: any) => u.user_id}
          empty="No users match the current filters."
        />
      )}

      {(creating || editing) && (
        <UserFormModal
          user={editing}
          districts={enums.districts}
          departments={enums.departments}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function UserFormModal({
  user,
  districts,
  departments,
  onClose,
  onSaved,
}: {
  user: any | null;
  districts: string[];
  departments: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<any>(() => ({
    name: user?.name ?? "",
    mobile: user?.mobile ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "VERIFICATION_OFFICER",
    district: user?.district ?? "",
    department: user?.department ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.name.trim() || (!form.mobile.trim() && !form.email.trim())) {
      setError("Provide a name and at least one of mobile or email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, mobile: form.mobile || undefined, email: form.email || undefined, district: form.district || undefined, department: form.department || undefined };
      if (user) {
        await api(`/users/${user.user_id}`, { method: "PATCH", body });
        toast.push("User updated.", "success");
      } else {
        await api("/users", { method: "POST", body });
        toast.push("User created.", "success");
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={user ? `Edit ${user.name}` : "New user"}
      onClose={onClose}
      footer={
        <div className="row gap-8" style={{ justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {user ? "Save changes" : "Create user"}
          </Button>
        </div>
      }
    >
      <div className="stack">
        <Input label="Name (required)" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} />
        <Input label="Mobile" value={form.mobile} onChange={(e) => setForm((f: any) => ({ ...f, mobile: e.target.value }))} />
        <Input label="Email" value={form.email} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} />
        <Select label="Role" value={form.role} onChange={(e) => setForm((f: any) => ({ ...f, role: e.target.value }))}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {titleCase(r)}
            </option>
          ))}
        </Select>
        <Select label="District" value={form.district} onChange={(e) => setForm((f: any) => ({ ...f, district: e.target.value }))}>
          <Options values={districts} allLabel="No district" raw />
        </Select>
        <Select label="Department" value={form.department} onChange={(e) => setForm((f: any) => ({ ...f, department: e.target.value }))}>
          <Options values={departments} allLabel="No department" raw />
        </Select>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Modal>
  );
}
