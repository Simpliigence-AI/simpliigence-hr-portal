import { supabase } from '@/lib/supabase';
import { getDeptColor } from '@/lib/utils';

export const revalidate = 300;

interface OrgNode { id: string; name: string; role: string; dept: string; reports: OrgNode[]; }

const ORG: OrgNode = {
  id:'SPL-0001', name:'Raghu Seetharam', role:'CEO / Founder', dept:'Leadership',
  reports:[
    { id:'SPL-073',  name:'Manjunath Tadahal',   role:'Site Head',              dept:'Operations',
      reports:[
        { id:'SPL-NEW6', name:'Harish Kumar Reddy', role:'Delivery Manager', dept:'Operations', reports:[] },
        { id:'SPL-010',  name:'Vinod Royan',         role:'SMB Projects',    dept:'Operations', reports:[] },
        { id:'SPL-039',  name:'Akanksha Srivastava', role:'India HR',        dept:'HR',         reports:[] },
        { id:'SPL-NEW9', name:'Lokanath G R',         role:'Operations',     dept:'Operations', reports:[] },
      ],
    },
    { id:'SPL-NEW2', name:'Anupama B', role:'Director - Architecture', dept:'Delivery',
      reports:[
        { id:'SPL-NEW22', name:'Vasanth P', role:'Program Manager', dept:'Delivery',
          reports:[
            { id:'SPL-065A',  name:'Allan Samuel',    role:'Business Analyst', dept:'Delivery', reports:[] },
            { id:'SPL-019',   name:'Bhanu Prakash C', role:'Business Analyst', dept:'Delivery', reports:[] },
            { id:'SPL-NEW7',  name:'Joseph Sunil',    role:'Business Analyst', dept:'Delivery', reports:[] },
            { id:'SPL-NEW12', name:'Pooja Sharma',    role:'Business Analyst', dept:'Delivery', reports:[] },
            { id:'SPL-NEW17', name:'Shivam Varma',    role:'Business Analyst', dept:'Delivery', reports:[] },
          ],
        },
        { id:'SPL-012', name:'Kokila Sampath', role:'Sr Developer', dept:'Delivery',
          reports:[
            { id:'SPL-030', name:'Arpit Soni',      role:'Sr Developer', dept:'Delivery', reports:[] },
            { id:'SPL-076', name:'Sourabh Pradhan',  role:'Developer',   dept:'Delivery', reports:[] },
          ],
        },
        { id:'SPL-065B', name:'Sailendra Raj Singh', role:'Sr Developer', dept:'Delivery',
          reports:[
            { id:'SPL-008',  name:'Anukanth S',        role:'Sr Developer', dept:'Delivery', reports:[] },
            { id:'SPL-NEW8', name:'Kamalapuram Balaji', role:'Developer',   dept:'Delivery', reports:[] },
          ],
        },
        { id:'SPL-026', name:'Shikhar Sharma', role:'Sr Developer', dept:'Delivery',
          reports:[
            { id:'SPL-003',   name:'Sai Aditya C',  role:'Sr Developer', dept:'Delivery', reports:[] },
            { id:'SPL-NEW13', name:'Sandeep Reddy',  role:'Sr Developer', dept:'Delivery', reports:[] },
            { id:'SPL-NEW11', name:'Pawan Thote',    role:'Developer',    dept:'Delivery', reports:[] },
          ],
        },
      ],
    },
    { id:'SPL-067', name:'Rupesh M', role:'Finance Lead', dept:'Finance',
      reports:[
        { id:'SPL-070', name:'Prajwal G',  role:'Finance',       dept:'Finance', reports:[] },
        { id:'SPL-075', name:'Somya Goel', role:'HR Operations', dept:'HR',      reports:[] },
      ],
    },
    { id:'SPL-062',  name:'Santhosh Pande', role:'GCC Sales',   dept:'Sales', reports:[] },
    { id:'US-001',   name:'Sudha Raghu',    role:'USCAN HR',    dept:'HR',
      reports:[
        { id:'US-002', name:'Vivin Deshpande',       role:'Architect',      dept:'Delivery', reports:[] },
        { id:'US-003', name:'Srikiran Betha',         role:'Consultant',     dept:'Delivery', reports:[] },
        { id:'US-004', name:'Samarendranath B',       role:'Consultant',     dept:'Delivery', reports:[] },
        { id:'US-005', name:'Srilekha K',             role:'Data Architect', dept:'Delivery', reports:[] },
        { id:'US-007', name:'Chaitanya Kulkarni',     role:'Architect',      dept:'Delivery', reports:[] },
        { id:'US-008', name:'Nichole Kruse',          role:'Consultant',     dept:'Delivery', reports:[] },
        { id:'US-009', name:'Sambram Rao',            role:'Consultant',     dept:'Delivery', reports:[] },
        { id:'US-011', name:'Vamsee Kurra',           role:'Consultant',     dept:'Delivery', reports:[] },
      ],
    },
    { id:'US-012', name:'Scott Murray', role:'USCAN Sales', dept:'Sales',
      reports:[
        { id:'SPL-NEW20', name:'Stuti Dwivedi', role:'Marketing Lead', dept:'Marketing',
          reports:[
            { id:'SPL-NEW10', name:'Nagajothika K', role:'Marketing', dept:'Marketing', reports:[] },
            { id:'SPL-052',   name:'Subhasmita D',  role:'Marketing', dept:'Marketing', reports:[] },
          ],
        },
      ],
    },
  ],
};

function OrgBox({ node, isRoot = false }: { node: OrgNode; isRoot?: boolean }) {
  const color = getDeptColor(node.dept);
  return (
    <div className="flex flex-col items-center">
      <div
        className="bg-white border rounded-xl p-3 shadow-sm text-center min-w-36 max-w-44"
        style={{ borderTopWidth: 4, borderTopColor: color }}
      >
        <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: color }}>
          {node.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
        </div>
        <div className="font-semibold text-xs text-gray-900 leading-tight">{node.name}</div>
        <div className="text-xs text-gray-400 mt-0.5 leading-tight">{node.role}</div>
        <span className="inline-block text-xs px-1.5 py-0.5 rounded-full text-white mt-1.5 font-medium" style={{ backgroundColor: color, fontSize: 10 }}>{node.dept}</span>
      </div>

      {node.reports.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex gap-4 items-start">
            {node.reports.map((child, i) => (
              <div key={child.id} className="flex flex-col items-center">
                {node.reports.length > 1 && <div className="w-px h-6 bg-gray-200" />}
                <OrgBox node={child} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function OrgChartPage() {
  const { data: employees } = await supabase.from('employees').select('id, name, role, dept, location, region').eq('active', true);
  const all = employees ?? [];

  const deptGroups: Record<string, typeof all> = {};
  for (const e of all) { deptGroups[e.dept ?? 'Other'] ??= []; deptGroups[e.dept ?? 'Other'].push(e); }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Org Chart</h1>
      <p className="text-sm text-gray-500 mb-8">Simpliigence reporting structure</p>

      {/* Tree */}
      <div className="overflow-auto pb-8">
        <div className="inline-flex min-w-full justify-center">
          <OrgBox node={ORG} isRoot />
        </div>
      </div>

      <hr className="my-8" />

      {/* Business units grid */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Business Units</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(deptGroups).sort((a, b) => b[1].length - a[1].length).map(([dept, emps]) => (
          <div key={dept} className="bg-white rounded-xl shadow-sm p-4 border-t-4" style={{ borderTopColor: getDeptColor(dept) }}>
            <div className="font-semibold text-sm text-gray-800 mb-1">{dept}</div>
            <div className="text-2xl font-bold" style={{ color: getDeptColor(dept) }}>{emps.length}</div>
            <div className="text-xs text-gray-400 mt-1">employees</div>
          </div>
        ))}
      </div>
    </div>
  );
}
