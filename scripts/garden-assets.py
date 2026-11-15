"""Rebuild Greenhouse's editable, rigged garden assets with Blender 4.5.

blender --background --python scripts/garden-assets.py -- [flowering|all]
Outputs are repository-local; Blender is needed only for asset authoring.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models' / 'garden'
SOURCE = ROOT / 'assets' / 'garden'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0
random.seed(17)


def paint():
    image = bpy.data.images.new('Watercolor paper', width=512, height=512)
    pixels = []
    for y in range(512):
        for x in range(512):
            wash = .84 + .065 * math.sin(x / 21 + math.sin(y / 39)) + .05 * math.sin(y / 17 + x / 54)
            wash += random.uniform(-.025, .025)
            pixels.extend((wash, wash, wash, 1))
    image.pixels = pixels
    image.filepath_raw = str(SOURCE / 'watercolor.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


paper = paint()


def material(name, color, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .88 if alpha == 1 else .25
    bsdf.inputs['Alpha'].default_value = alpha
    # glTF supports this multiply through a vertex color plus base texture.
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = paper
    vertex = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Paint'
    mix = mat.node_tree.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1
    mat.node_tree.links.new(tex.outputs['Color'], mix.inputs[1])
    mat.node_tree.links.new(vertex.outputs['Color'], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    if alpha < 1:
        mat.surface_render_method = 'DITHERED'
    return mat, color


cream = material('Warm cream paper', (.98, .88, .63))
green = material('Leaf green', (.38, .56, .15))
lightgreen = material('Leaf tips', (.65, .73, .32))
pink = material('Ear blush', (.76, .39, .29))
eyes = material('Terracotta eyes', (.29, .085, .045))
white = material('Soft eye glints', (.99, .93, .72))
purple = material('Lavender petals', (.52, .40, .71))
succulent = material('Sage succulent', (.48, .67, .44))
moss = material('Moss crown', (.32, .47, .10))
wood = material('Cork and wood', (.43, .26, .12))
stone = material('Warm stone', (.47, .49, .32))
glass = material('Painted glass', (.72, .88, .77), .16)


def finish(obj, mat, bone=None):
    obj.data.materials.append(mat[0])
    colors = obj.data.color_attributes.new(name='Paint', type='FLOAT_COLOR', domain='POINT')
    for vertex in obj.data.vertices:
        # A warm underpainting shaded toward green at the feet/body edges.
        factor = .92 + .08 * math.sin(vertex.co.z * 3 + vertex.co.x * 2)
        colors.data[vertex.index].color = (*(c * factor for c in mat[1]), 1)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bone:
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    return obj


def sphere(name, location, scale, mat, bone=None, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bone)


def cylinder(name, location, radius, depth, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    bevel = obj.modifiers.new('Soft rim', 'BEVEL')
    bevel.width = .035
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return finish(obj, mat)


def leaf(name, start, angle, length, width, rise, mat=green, bone='head'):
    # Curved lanceolate surface with a central ridge and a visible underside.
    vertices, faces = [], []
    for row in range(7):
        t = row / 6
        span = width * math.sin(math.pi * t) + .006
        for side in [-1, 0, 1]:
            lateral = side * span
            distance = t * length
            vertices.append((start[0] + math.cos(angle) * distance - math.sin(angle) * lateral,
                             start[1] + math.sin(angle) * distance + math.cos(angle) * lateral,
                             start[2] + rise * t + .12 * math.sin(math.pi * t) * (1 - abs(side) * .55)))
    for row in range(6):
        for col in range(2):
            a = row * 3 + col
            faces.append((a, a + 1, a + 4, a + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        for index in polygon.loop_indices:
            v = mesh.loops[index].vertex_index
            mesh.uv_layers.active.data[index].uv = ((v % 3) / 2, (v // 3) / 6)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    solid = obj.modifiers.new('Leaf thickness', 'SOLIDIFY')
    solid.thickness = .018
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    return finish(obj, mat, bone)


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def character(family):
    clear()
    sphere('Body', (0, 0, .56), (.235, .18, .32), cream, 'root')
    sphere('Leaf belly', (0, -.145, .45), (.18, .052, .20), lightgreen, 'root')
    sphere('Head', (0, -.02, 1.23), (.48, .34, .40), cream, 'head', 20, 12)
    for sign, label in [(-1, 'L'), (1, 'R')]:
        ear = sphere('Drooping ear ' + label, (sign * .43, -.005, 1.15), (.16, .09, .23), cream, 'head')
        ear.rotation_euler.y = sign * -.55
        sphere('Ear wash ' + label, (sign * .49, -.066, 1.12), (.086, .024, .12), pink, 'head', 12, 8)
        sphere('Eye ' + label, (sign * .185, -.338, 1.24), (.046, .023, .079), eyes, 'head', 12, 8)
        sphere('Eye glint ' + label, (sign * .185 - .01, -.359, 1.27), (.012, .007, .019), white, 'head', 8, 6)
        sphere('Cheek ' + label, (sign * .30, -.29, 1.14), (.055, .016, .025), pink, 'head', 10, 6)
        arm = sphere('Arm ' + label, (sign * .27, -.005, .58), (.086, .09, .20), cream, 'arm_' + label)
        arm.rotation_euler.y = sign * -.24
        sphere('Leaf hand ' + label, (sign * .30, -.025, .43), (.083, .088, .08), green, 'arm_' + label, 12, 8)
        sphere('Foot ' + label, (sign * .12, -.02, .17), (.093, .11, .17), green, 'leg_' + label)
    sphere('Little mouth', (0, -.353, 1.12), (.018, .01, .022), eyes, 'head', 8, 6)
    for i in range(9):
        leaf('Leaf fringe', (0, 0, 1.55), i * math.tau / 9, .43, .15, -.12, lightgreen)
    if family == 'flowering':
        for i in range(7):
            leaf('Crown leaf', (0, .02, 1.61), i * math.tau / 7 + .35, .68, .19, .18, green)
        # Segmented curved stem, weighted to the head.
        for i in range(8):
            t = i / 7
            sphere('Flower stem', (-.12 + .22 * math.sin(t * 2), .07, 1.65 + t * .63), (.027, .027, .07), green, 'head', 8, 6)
        sphere('Flower heart', (.08, -.02, 2.28), (.10, .10, .10), white, 'head', 12, 8)
        for i in range(5):
            angle = i * math.tau / 5
            sphere('Lavender petal', (.08 + .12 * math.cos(angle), -.03 + .07 * math.sin(angle), 2.26 + .08 * math.sin(angle)), (.10, .085, .13), purple, 'head', 10, 6)
    elif family == 'succulent':
        for layer, count in [(0, 10), (1, 8), (2, 6)]:
            for i in range(count):
                leaf('Rosette leaf', (0, 0, 1.58 + layer * .12), i * math.tau / count + layer * .27,
                     .62 - layer * .16, .18 - layer * .025, .25 + layer * .09, succulent)
    else:
        for i in range(16):
            angle = i * 2.4
            radius = .32 * math.sqrt(i / 16)
            sphere('Moss cushion', (math.cos(angle) * radius, math.sin(angle) * radius, 1.65 + .20 * (1 - radius)), (.16, .14, .14), moss, 'head', 8, 6)
        for i in range(5):
            leaf('Fern sprig', (0, .04, 1.74), i * 1.4, .42, .09, .24, lightgreen)
    meshes = list(bpy.context.scene.objects)
    bpy.ops.object.armature_add()
    rig = bpy.context.object
    rig.name = 'CompanionRig'
    bpy.ops.object.mode_set(mode='EDIT')
    rig.data.edit_bones.remove(rig.data.edit_bones[0])
    specs = [('root', (0, 0, .45), (0, 0, .75), None),
             ('head', (0, 0, .94), (0, 0, 1.55), 'root'),
             ('arm_L', (-.22, 0, .78), (-.30, 0, .42), 'root'),
             ('arm_R', (.22, 0, .78), (.30, 0, .42), 'root'),
             ('leg_L', (-.12, 0, .30), (-.12, 0, .03), 'root'),
             ('leg_R', (.12, 0, .30), (.12, 0, .03), 'root')]
    for name, head, tail, parent in specs:
        bone = rig.data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in meshes:
        modifier = obj.modifiers.new('Shared companion skeleton', 'ARMATURE')
        modifier.object = rig
        obj.parent = rig
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    bpy.context.object.name = family + ' painted companion'
    animate(rig)
    export(family)


def animate(rig):
    clips = ['idle', 'walk', 'run', 'sit_down', 'seated', 'lie_down', 'resting', 'stand_up', 'rise', 'react']
    rig.animation_data_create()
    for clip in clips:
        action = bpy.data.actions.new(clip)
        rig.animation_data.action = action
        length = 48 if clip in ['idle', 'seated', 'resting'] else 24
        for frame in range(1, length + 2, 3):
            t = min(1, (frame - 1) / length)
            for bone in rig.pose.bones:
                bone.rotation_mode = 'XYZ'
                bone.rotation_euler = (0, 0, 0)
                bone.location = (0, 0, 0)
            root, head = rig.pose.bones['root'], rig.pose.bones['head']
            wave = math.sin(t * math.tau)
            head.rotation_euler.y = wave * .035
            if clip in ['walk', 'run']:
                amp = .48 if clip == 'walk' else .75
                root.location.y = abs(wave) * (.025 if clip == 'walk' else .06)
                for name, sign in [('L', -1), ('R', 1)]:
                    rig.pose.bones['leg_' + name].rotation_euler.x = wave * amp * sign
                    rig.pose.bones['arm_' + name].rotation_euler.x = -wave * amp * .6 * sign
            elif clip in ['sit_down', 'seated', 'stand_up']:
                factor = t if clip == 'sit_down' else 1 - t if clip == 'stand_up' else 1
                root.location.y = -.18 * factor
                for name in ['L', 'R']:
                    rig.pose.bones['leg_' + name].rotation_euler.x = -1.15 * factor
            elif clip in ['lie_down', 'resting', 'rise']:
                factor = t if clip == 'lie_down' else 1 - t if clip == 'rise' else 1
                root.rotation_euler.x = 1.28 * factor
                root.location.y = -.31 * factor
                head.rotation_euler.x = -.12 * factor
            elif clip == 'react':
                root.location.y = math.sin(t * math.pi) * .09
                rig.pose.bones['arm_R'].rotation_euler.z = -.9 * math.sin(t * math.pi)
                head.rotation_euler.z = .12 * math.sin(t * math.pi)
            else:
                root.location.y = wave * .012
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_euler', frame=frame)
                bone.keyframe_insert('location', frame=frame)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 1, action)
        track.mute = True
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)


def atlasify():
    palette = [cream, green, lightgreen, pink, eyes, white, purple, succulent, moss, wood, stone, glass]
    image = bpy.data.images.get('Garden painted atlas')
    if not image:
        image = bpy.data.images.new('Garden painted atlas', width=1024, height=1024)
        pixels = []
        for y in range(1024):
            for x in range(1024):
                tile = (y // 256) * 4 + x // 256
                rgb = palette[min(tile, len(palette) - 1)][1]
                wash = .91 + .04 * math.sin(x / 17 + math.sin(y / 31)) + .035 * math.sin(y / 13 + x / 47) + random.uniform(-.02, .02)
                pixels.extend((*(c * wash for c in rgb), 1))
        image.pixels = pixels
        image.filepath_raw = str(SOURCE / 'painted-atlas.png')
        image.file_format = 'PNG'
        image.save()
        image.pack()
    shared = []
    for name, alpha in [('Painted atlas', 1), ('Atlas glass', .16)]:
        mat = bpy.data.materials.get(name)
        if not mat:
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            bsdf.inputs['Roughness'].default_value = .86 if alpha == 1 else .25
            bsdf.inputs['Alpha'].default_value = alpha
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            if alpha < 1:
                mat.surface_render_method = 'DITHERED'
        shared.append(mat)
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    for obj in meshes:
        slots = list(obj.data.materials)
        indices = []
        for polygon in obj.data.polygons:
            old = slots[polygon.material_index]
            tile = next(i for i, pair in enumerate(palette) if pair[0] == old)
            for index in polygon.loop_indices:
                uv = obj.data.uv_layers.active.data[index].uv
                # Inset prevents filtering into adjacent swatches.
                uv.x = (tile % 4 + .025 + uv.x * .95) / 4
                uv.y = (tile // 4 + .025 + uv.y * .95) / 4
            indices.append(1 if old == glass[0] else 0)
        obj.data.materials.clear()
        for mat in shared:
            obj.data.materials.append(mat)
        for polygon, index in zip(obj.data.polygons, indices):
            polygon.material_index = index
    if meshes and not any(obj.type == 'ARMATURE' for obj in bpy.context.scene.objects):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()


def export(name):
    atlasify()
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + '.blend')), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + '.glb')), export_format='GLB',
                              export_animations=True, export_animation_mode='ACTIONS',
                              export_nla_strips=True, export_materials='EXPORT')


def habitat():
    clear()
    cylinder('Wooden pedestal', (0, 0, .08), .62, .16, wood)
    cylinder('Moss bed', (0, 0, .19), .53, .10, moss)
    sphere('Glass jar', (0, 0, .79), (.60, .60, .68), glass, segments=24, rings=16)
    cylinder('Cork stopper', (0, 0, 1.45), .36, .13, wood)
    bpy.ops.mesh.primitive_torus_add(major_radius=.36, minor_radius=.028, major_segments=24, minor_segments=6, location=(0, 0, 1.35))
    finish(bpy.context.object, wood)
    for i in range(6):
        angle = i * math.tau / 6
        sphere('Pebble', (.41 * math.cos(angle), .41 * math.sin(angle), .26), (.11, .08, .065), stone, segments=10, rings=6)
        leaf('Jar fern', (.42 * math.cos(angle), .42 * math.sin(angle), .28), angle + .5, .20, .08, .19, lightgreen, None)
    export('habitat')


def kit():
    clear()
    sphere('Moss stone', (0, 0, .10), (.30, .22, .17), stone, segments=12, rings=8)
    sphere('Stone moss', (0, 0, .20), (.23, .19, .065), moss, segments=12, rings=6)
    export('stone')
    clear()
    for i in range(5):
        leaf('Garden fern', (0, 0, 0), i * 1.6, .45, .10, .30, green, None)
    export('fern')
    clear()
    cylinder('Flower stem', (0, 0, .17), .018, .34, green, 8)
    sphere('Flower center', (0, 0, .35), (.045, .045, .04), white, segments=8, rings=6)
    for i in range(5):
        angle = i * math.tau / 5
        sphere('Flower petal', (.065 * math.cos(angle), .065 * math.sin(angle), .35), (.055, .055, .025), purple, segments=8, rings=6)
    export('flower')


def meadow():
    image = bpy.data.images.new('Painted meadow', width=512, height=512)
    pixels = []
    random.seed(36)
    for y in range(512):
        for x in range(512):
            wash = .045 * math.sin(x / 23 + math.sin(y / 19)) + .035 * math.sin(y / 41 + math.cos(x / 17))
            grain = random.uniform(-.018, .018)
            pixels.extend((.42 + wash + grain, .53 + wash + grain, .27 + wash * .6 + grain, 1))
    image.pixels = pixels
    image.filepath_raw = str(OUT / 'meadow.png')
    image.file_format = 'PNG'
    image.save()


selected = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['all']
for family in (['flowering'] if 'flowering' in selected else ['flowering', 'succulent', 'moss']):
    character(family)
if 'flowering' not in selected:
    habitat()
    kit()
    meadow()
print('Garden assets exported to', OUT)
