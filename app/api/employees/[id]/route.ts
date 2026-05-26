import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * DELETE /api/employees/[id]
 *
 * Admin-only endpoint — NOT exposed in the frontend UI.
 * Protected by a secret key that must be passed as the X-Admin-Key header.
 *
 * Usage (curl):
 *   curl -X DELETE \
 *     -H "X-Admin-Key: <ADMIN_DELETE_KEY>" \
 *     https://simpliigence-hr-portal.vercel.app/api/employees/SPL-XXX
 *
 * The request cascades: documents linked to this employee are deleted first,
 * then the employee record itself.
 *
 * Intended use: cleaning up test employees created during QA / demos.
 */

// Use the service-role key so we can bypass RLS for hard deletes.
function adminSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
          throw new Error('Missing Supabase env vars (URL or SERVICE_ROLE_KEY)');
        }
    return createClient(url, key);
  }

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } },
  ) {
    // Auth check
    const adminKey = process.env.ADMIN_DELETE_KEY;
    if (!adminKey) {
          return NextResponse.json(
                  { error: 'Server misconfiguration: ADMIN_DELETE_KEY not set' },
                  { status: 500 },
                );
        }

    const provided = req.headers.get('x-admin-key');
    if (!provided || provided !== adminKey) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

    // Validate employee id format
    const { id } = params;
    if (!id || !/^SPL-\d+$/i.test(id)) {
          return NextResponse.json(
                  { error: 'Invalid employee ID format. Expected SPL-XXX' },
                  { status: 400 },
                );
        }

    const supabase = adminSupabase();

    // Verify employee exists
    const { data: employee, error: fetchErr } = await supabase
      .from('employees')
      .select('id, name')
      .eq('id', id)
      .single();

    if (fetchErr || !employee) {
          return NextResponse.json(
                  { error: `Employee ${id} not found` },
                  { status: 404 },
                );
        }

    // Delete linked documents first
    const { error: docErr } = await supabase
      .from('documents')
      .delete()
      .eq('employee_id', id);

    if (docErr) {
          return NextResponse.json(
                  { error: `Failed to delete documents: ${docErr.message}` },
                  { status: 500 },
                );
        }

    // Delete the employee record
    const { error: empErr } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);

    if (empErr) {
          return NextResponse.json(
                  { error: `Failed to delete employee: ${empErr.message}` },
                  { status: 500 },
                );
        }

    return NextResponse.json({
          success: true,
          deleted: { id: employee.id, name: employee.name },
        });
  }
