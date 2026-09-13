// Shared by authorization and the role/user permission screens. SUPER inherits
// the active catalog at read time; other roles retain their explicit grants.
// A role name alone is insufficient: SUPER must remain a protected system role.
export const EFFECTIVE_ROLE_GRANTS_SQL = `(
  SELECT rp.role_id,rp.permission_code,rp.scope_code
  FROM role_permissions rp
  JOIN roles granted_role ON granted_role.id=rp.role_id
  JOIN permission_definitions granted_permission ON granted_permission.code=rp.permission_code
  WHERE granted_role.code<>'SUPER' AND granted_permission.is_active=TRUE
  UNION ALL
  SELECT super_role.id,pd.code,'ALL'
  FROM roles super_role
  JOIN permission_definitions pd ON pd.is_active=TRUE AND pd.is_legacy=FALSE
    AND JSON_CONTAINS(pd.supported_scopes_json,JSON_QUOTE('ALL'))
  WHERE super_role.code='SUPER' AND super_role.is_system=TRUE
    AND super_role.is_protected=TRUE AND super_role.is_active=TRUE
)`;
