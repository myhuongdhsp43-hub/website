import { json, noStore } from '@/lib/server/http';
import { getSessionUser } from '@/lib/server/password-auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return noStore(json({
      success: true,
      authenticated: false,
      user: null,
    }));
  }

  return noStore(json({
    success: true,
    authenticated: true,
    user: {
      id: user.id,
      displayName: user.full_name || user.username || user.email,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      role: user.role,
      schoolId: user.school_id,
      schoolName: user.school_name,
      accountType: user.account_type || 'school',
      studentId: user.student_id || null,
    },
  }));
}
