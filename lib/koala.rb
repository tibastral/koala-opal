require 'jquery'
require 'opal'
require 'opal-jquery'
require 'dare'

class Toto < Dare::Window
  SPRITE_SIZE = 128
  WINDOW_X = 1024
  WINDOW_Y = 768
  REINIT_ENEMIES = true
  SPRITES = %w(background enemy flag koala)

  def sprite(str)
    @sprites ||= {}
    @sprites[str] ||= Dare::Image.new("images/#{str}.png")
  end

  def initialize
    super width: 1024, height: 768, border: true
    @flag = {x: WINDOW_X - SPRITE_SIZE, y: WINDOW_Y - SPRITE_SIZE}
    @music = Dare::Sound.new('musics/koala.wav')
    @font = Dare::Font.new(font: "Helvetica", size: 20, color: 'black')
    reset
  end

  def draw
    9.times do |x|
      9.times do |y|
        sprite(:background).draw(x * SPRITE_SIZE, y * SPRITE_SIZE)
      end
    end

    sprite(:koala).draw(@player[:x], @player[:y])
    @enemies.each do |enemy|
      sprite(:enemy).draw(enemy[:x], enemy[:y])
    end
    sprite(:flag).draw(@flag[:x], @flag[:y])
    @font.draw("Level #{@enemies.length}", WINDOW_X - 100, 10)
  end

  def update
    @player[:x] += @speed if button_down?(Dare::KbRight)
    @player[:x] -= @speed if button_down?(Dare::KbLeft)
    @player[:y] += @speed if button_down?(Dare::KbDown)
    @player[:y] -= @speed if button_down?(Dare::KbUp)
    @player[:x] = normalize(@player[:x], WINDOW_X - SPRITE_SIZE)
    @player[:y] = normalize(@player[:y], WINDOW_Y - SPRITE_SIZE)
    handle_enemies
    if winning?
      reinit
    end
    if loosing?
      reset
    end
  end

  private

  def reset
    @enemies = []
    @speed = 3
    # @music.stop
    @music.play
    reinit
  end

  def reinit
    @speed += 1
    @player = {x: 0, y: 0}
    if REINIT_ENEMIES
      @enemies = @enemies.map{rand_enemy}
    end
    @enemies.push rand_enemy
  end

  def rand_enemy
    {x: 500 + rand(200), y: 200 + rand(300)}
  end

  def collision?(a, b)
    (a[:x] - b[:x]).abs < SPRITE_SIZE / 2 &&
    (a[:y] - b[:y]).abs < SPRITE_SIZE / 2
  end

  def loosing?
    @enemies.any? do |enemy|
      collision?(@player, enemy)
    end
  end

  def winning?
    collision?(@player, @flag)
  end

  def random_mouvement
    rand(3) - 1
  end

  def normalize(v, max)
    if v < 0
      0
    elsif v > max
      max
    else
      v
    end
  end

  def handle_enemies
    @enemies = @enemies.map do |enemy|
      enemy[:timer] ||= 0
      if enemy[:timer] == 0
        enemy[:result_x] = random_mouvement
        enemy[:result_y] = random_mouvement
        enemy[:timer] = 50 + rand(50)
      end
      enemy[:timer] -= 1

      new_enemy = enemy.dup
      new_enemy[:x] += new_enemy[:result_x] * @speed
      new_enemy[:y] += new_enemy[:result_y] * @speed
      new_enemy[:x] = normalize(new_enemy[:x], WINDOW_X - SPRITE_SIZE)
      new_enemy[:y] = normalize(new_enemy[:y], WINDOW_Y - SPRITE_SIZE)
      unless collision?(new_enemy, @flag)
        enemy = new_enemy
      end
      enemy
    end
  end
end

Toto.new.run!
