import { useNavigate } from 'react-router-dom';
import ChooseTenantType from '../onboarding/ChooseTenantType';

/**
 * AddNewTenant — Entry point untuk membuat tenant baru tanpa logout.
 * Ref: task.md T2.7, specification.md §7.2
 */
export default function AddNewTenant() {
  const navigate = useNavigate();

  return (
    <ChooseTenantType
      onCancel={() => navigate('/account/tenants')}
      redirectOnSuccess={true}
    />
  );
}
