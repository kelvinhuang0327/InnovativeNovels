require 'xcodeproj'
require 'fileutils'

project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)

app_target = project.targets.find { |t| t.name == 'App' }
raise "App target not found in project" unless app_target

target_name = 'AppUITests'
ui_test_target = project.targets.find { |t| t.name == target_name }

unless ui_test_target
  ui_test_target = project.new_target(:ui_test_bundle, target_name, :ios, '16.0', project.products_group)
  
  project.root_object.attributes['TargetAttributes'] ||= {}
  project.root_object.attributes['TargetAttributes'][ui_test_target.uuid] = {
    'TestTargetID' => app_target.uuid
  }
  
  ui_test_target.add_dependency(app_target)
  
  group = project.main_group.find_subpath('AppUITests', true)
  group.set_source_tree('<group>')
  
  plist_ref = group.new_file('AppUITests/Info.plist')
  swift_file = group.new_file('AppUITests/AppUITests.swift')
  
  ui_test_target.add_file_references([swift_file])
  
  frameworks_phase = ui_test_target.frameworks_build_phase
  xctest_ref = project.frameworks_group.new_file('System/Library/Frameworks/XCTest.framework')
  xctest_ref.source_tree = 'SDKROOT'
  frameworks_phase.add_file_reference(xctest_ref)
  puts "Created target #{target_name}"
end

ui_test_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = 'AppUITests'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.innovativenovels.preview.AppUITests'
  config.build_settings['INFOPLIST_FILE'] = 'AppUITests/Info.plist'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TEST_TARGET_NAME'] = 'App'
  config.build_settings['USES_XCTEST'] = 'YES'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
  config.build_settings['DEVELOPMENT_TEAM'] = ''
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @loader_path/Frameworks'
end

project.save

# Generate shared scheme App.xcscheme
scheme_dir_proj = File.join(project_path, 'xcshareddata', 'xcschemes')
FileUtils.mkdir_p(scheme_dir_proj)

scheme_xml = <<~XML
<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "#{app_target.uuid}"
               BuildableName = "App.app"
               BlueprintName = "App"
               ReferencedContainer = "container:App.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
         <TestableReference
            skipped = "NO">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "#{ui_test_target.uuid}"
               BuildableName = "AppUITests.xctest"
               BlueprintName = "AppUITests"
               ReferencedContainer = "container:App.xcodeproj">
            </BuildableReference>
         </TestableReference>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "#{app_target.uuid}"
            BuildableName = "App.app"
            BlueprintName = "App"
            ReferencedContainer = "container:App.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "#{app_target.uuid}"
            BuildableName = "App.app"
            BlueprintName = "App"
            ReferencedContainer = "container:App.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
XML

File.write(File.join(scheme_dir_proj, 'App.xcscheme'), scheme_xml)
puts "Wrote shared scheme App.xcscheme to #{scheme_dir_proj}"
