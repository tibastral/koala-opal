desc "Build toto.js"
task :build do
  gem 'dare', github: 'tibastral/dare'
  gem 'opal', '0.7.0beta3'
  gem 'opal-jquery', '0.3.0beta1'
  require 'opal'
  require 'opal-jquery'
  Opal::Processor.source_map_enabled = false
  Opal::Processor.inline_operators_enabled = true
  env = Sprockets::Environment.new
  Opal.paths.each do |path|
    env.append_path path
  end
  env.append_path "."
  env.append_path `bundle show dare`.chomp + '/lib'

  File.open("toto.js", "w+") do |out|
    out << env["toto"].to_s
  end
end
