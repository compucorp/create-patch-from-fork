# Create Patch From Fork

```
Warning:

This action is unlikely to be useful to your project, as it was created 
to support our internal workflow.
```

This action helps with the automation of patching projects. It:

- Creates a patch file from a patches branch in a fork
- Applies this patch to a previously downloaded project
- Creates a tarball with the patched project

### Usage

Check the `action.yml` for a list of accepts input params and output values.

Sample usage:

```yaml
- name: Create patched package
  uses: 'compucorp/create-patch-from-fork@1.0.0
  id: "patch"
  with:
    base_version: 7.x-4.28
    project_dir: '../to-be-patched/webform_civicrm'
    project_name: 'webform_civicrm'
    project_type: 'drupal-module'
```

### Development

After any change, the `dist/index.js` needs to be recompiled. This can be done by running `npm run build`. There's a precommit hook that runs the command automatically.
