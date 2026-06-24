import type {
  IAMGrant,
  IAMRelationship,
  IAMRole,
} from "./documents";

export interface IAMRoleRow extends Record<string, unknown> {
  id: string;
  namespace: string;
  label: string;
  description: string;
}

export interface IAMGrantRow extends Record<string, unknown> {
  id: string;
  principal_id: string;
  principal_type: string;
  principalRef: string;
  principal_label: string;
  role: string;
  namespace: string;
  roleName: string;
}

export interface IAMRelationshipRow extends Record<string, unknown> {
  id: string;
  resource_type: string;
  resource_id: string;
  relation: string;
  subject_type: string;
  subject_id: string;
  subject_relation: string;
  caveat_name: string;
  resourceRef: string;
  subjectRef: string;
}

export function roleRows(roles: readonly IAMRole[]): IAMRoleRow[] {
  return [...roles]
    .sort((left, right) =>
      left.namespace.localeCompare(right.namespace)
      || left.label.localeCompare(right.label),
    )
    .map((role) => ({
      id: role.id,
      namespace: role.namespace,
      label: role.label,
      description: role.description,
    }));
}

export function roleRef(role: Pick<IAMRole, "id" | "namespace">): string {
  return `${role.namespace}/role:${role.id}`;
}

export function grantRows(grants: readonly IAMGrant[]): IAMGrantRow[] {
  return [...grants]
    .sort((left, right) =>
      roleNamespace(left.role).localeCompare(roleNamespace(right.role))
      || left.role.localeCompare(right.role)
      || principalRef(left).localeCompare(principalRef(right)),
    )
    .map((grant) => {
      const principal = principalRef(grant);
      return {
        id: `${principal}:${grant.role}`,
        principal_id: grant.principal_id,
        principal_type: grant.principal_type,
        principalRef: principal,
        principal_label: grant.principal_label || principal,
        role: grant.role,
        namespace: roleNamespace(grant.role),
        roleName: roleName(grant.role),
      };
    });
}

export function relationshipRows(
  relationships: readonly IAMRelationship[],
): IAMRelationshipRow[] {
  return [...relationships]
    .sort((left, right) =>
      left.resource_type.localeCompare(right.resource_type)
      || left.resource_id.localeCompare(right.resource_id)
      || left.relation.localeCompare(right.relation)
      || left.subject_type.localeCompare(right.subject_type)
      || left.subject_id.localeCompare(right.subject_id),
    )
    .map((relationship) => {
      const resourceRef = relationshipResourceRef(relationship);
      const subjectRef = relationshipSubjectRef(relationship);
      return {
        id: `${resourceRef}->${subjectRef}:${relationship.caveat_name}`,
        resource_type: relationship.resource_type,
        resource_id: relationship.resource_id,
        relation: relationship.relation,
        subject_type: relationship.subject_type,
        subject_id: relationship.subject_id,
        subject_relation: relationship.subject_relation,
        caveat_name: relationship.caveat_name,
        resourceRef,
        subjectRef,
      };
    });
}

export function roleNamespace(role: string): string {
  const slash = role.indexOf("/");
  return slash > 0 ? role.slice(0, slash) : "default";
}

function roleName(role: string): string {
  const colon = role.lastIndexOf(":");
  return colon >= 0 ? role.slice(colon + 1) : role;
}

function principalRef(grant: IAMGrant): string {
  return `${grant.principal_type}:${grant.principal_id}`;
}

function relationshipResourceRef(relationship: IAMRelationship): string {
  return `${relationship.resource_type}:${relationship.resource_id}#${relationship.relation}`;
}

function relationshipSubjectRef(relationship: IAMRelationship): string {
  const ref = `${relationship.subject_type}:${relationship.subject_id}`;
  return relationship.subject_relation
    ? `${ref}#${relationship.subject_relation}`
    : ref;
}
