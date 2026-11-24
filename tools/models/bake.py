# Blender でモデルを開き、面を減らし、動きの各コマの頂点を書き出す
# 使い方：python bake.py -- <.blend> <メッシュの名前> <動きの名前> <面の数の目安（0 で減らさない）> <出力 .npz>
# 例（もとのファイルは、README の配布元から取ってくる）：
#   python bake.py -- Wolf.blend Wolf Walking 460 wolf.npz
#   python bake.py -- Eagle.blend Eagle Flying 480 eagle.npz
#   python bake.py -- Piranha.blend Fish Swimming 380 fish.npz
#   python bake.py -- dragon_model.blend Dragon Flying 640 dragon.npz
import bpy, sys, json, numpy as np
args = sys.argv[sys.argv.index('--')+1:]
path, mesh_name, action_name, target_tris, out = args[0], args[1], args[2], int(args[3]), args[4]
bpy.ops.wm.open_mainfile(filepath=path)
scene = bpy.context.scene
ob = bpy.data.objects[mesh_name]
arm = ob.find_armature() or ob.parent
for o in bpy.data.objects: o.select_set(False)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
# いらない加工を外す。左右の写し（ミラー）は、先に本体へ焼きこむ
for m in list(ob.modifiers):
    if m.type in ('SUBSURF', 'NODES'): ob.modifiers.remove(m)
for m in list(ob.modifiers):
    if m.type == 'MIRROR':
        while ob.modifiers[0] != m: bpy.ops.object.modifier_move_up(modifier=m.name)
        bpy.ops.object.modifier_apply(modifier=m.name)
arms = [m for m in ob.modifiers if m.type == 'ARMATURE']
for m in arms[1:]:
    if m.object == arms[0].object or m.object is None: ob.modifiers.remove(m)
me = ob.data
me.calc_loop_triangles(); tris0 = len(me.loop_triangles)
if target_tris and tris0 > target_tris:
    d = ob.modifiers.new('dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = target_tris / tris0; d.use_collapse_triangulate = True
    try: d.use_symmetry = bool(int(args[5])) if len(args) > 5 else False; d.symmetry_axis = args[6] if len(args) > 6 else 'X'
    except Exception as e: print('sym', e)
    while ob.modifiers[0] != d: bpy.ops.object.modifier_move_up(modifier=d.name)
act = bpy.data.actions[action_name]
ad = arm.animation_data or arm.animation_data_create(); ad.action = act
try:
    if hasattr(ad, 'action_slot') and ad.action_slot is None and len(act.slots): ad.action_slot = act.slots[0]
except Exception as e: print('slot', e)
f0, f1 = act.frame_range
frames = []; tris = None
n = int(round(f1 - f0))
for i in range(n + 1):
    scene.frame_set(int(f0 + i))
    dg = bpy.context.evaluated_depsgraph_get(); eo = ob.evaluated_get(dg); m = eo.to_mesh()
    M = np.array(eo.matrix_world)
    co = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    frames.append(co @ M[:3, :3].T + M[:3, 3])
    if tris is None:
        m.calc_loop_triangles(); t = np.empty(len(m.loop_triangles) * 3, dtype=np.int32); m.loop_triangles.foreach_get('vertices', t); tris = t.reshape(-1, 3)
    eo.to_mesh_clear()
V = np.array(frames)
np.savez(out, V=V, T=tris)
print('BAKED', mesh_name, action_name, 'tris0', tris0, '->', len(tris), 'verts', V.shape, 'frames', f0, f1, 'bbox', V[0].min(0).round(2), V[0].max(0).round(2))
