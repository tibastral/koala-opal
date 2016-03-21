require 'jquery'
require 'opal'
require 'opal-jquery'
require 'dare'

class Toto < Dare::Window

  def initialize
    super width: 1024, height: 768, border: true
  end

  def draw
    #code that draws every frame
  end

  def update
    #code that runs every update_interval
  end

end

Toto.new.run!
